# Missing Functionality: DeepAgents → Vanilla LangGraph

## 1. Context Window Management (Conversation Summarization)

Long conversations will eventually exceed the model's context limit and error out. DeepAgents handles this with `SummarizationMiddleware`, which runs as a `before_model` hook.

### What it does

- Counts tokens in the current message history on every turn
- When context hits a configurable threshold (e.g. 85% of max input tokens), it triggers summarization
- Partitions messages into "to evict" and "to keep" (e.g. keep the last 10% of messages)
- **Offloads the full evicted conversation** to a file at `/conversation_history/{thread_id}.md` via the backend, so the agent can re-read it later if needed
- Generates a summary via an LLM call and replaces the evicted messages with a single `HumanMessage` containing the summary + file path reference
- Filters out previous summary messages during chained summarization to avoid redundant storage
- As a separate pre-summarization step, **truncates large tool call arguments** (e.g. `write_file`/`edit_file` content >2000 chars) in older messages to reclaim space before full summarization is needed

### DeepAgents implementation

**File:** `libs/deepagents/deepagents/middleware/summarization.py` — `SummarizationMiddleware`

Key methods:
- `before_model()` / `abefore_model()` — entry point, runs token counting → arg truncation → summarization → offload → message replacement
- `_truncate_args()` — truncates `write_file`/`edit_file` arguments >2000 chars in old messages (configurable via `TruncateArgsSettings`)
- `_offload_to_backend()` — writes evicted messages as markdown to `/conversation_history/{thread_id}.md`, appending timestamped sections
- `_build_new_messages_with_path()` — constructs the replacement summary message with file path reference

Configured with:
```python
SummarizationMiddleware(
    model="gpt-4o-mini",
    backend=backend,
    trigger=("fraction", 0.85),
    keep=("fraction", 0.10),
    truncate_args_settings={"trigger": ("messages", 50), "keep": ("messages", 20), "max_length": 2000},
)
```

---

## 2. Large Tool Result Eviction

A single `execute` call can return massive output that bloats the context window. DeepAgents intercepts tool results that exceed a token threshold and offloads them to the filesystem.

### What it does

- After every tool call (except `ls`, `glob`, `grep`, `read_file`, `edit_file`, `write_file`), checks if the result exceeds ~20,000 tokens (~80,000 chars)
- If it does, writes the full output to `/large_tool_results/{tool_call_id}`
- Replaces the `ToolMessage` content with a head/tail preview (5 lines each) + a file path reference
- The agent can then use `read_file` with `offset`/`limit` to read the full output in chunks

### DeepAgents implementation

**File:** `libs/deepagents/deepagents/middleware/filesystem.py` — `FilesystemMiddleware`

Key methods:
- `wrap_tool_call()` / `awrap_tool_call()` — intercepts tool results after execution, calls `_intercept_large_tool_result()`
- `_process_large_message()` / `_aprocess_large_message()` — checks size, writes to backend at `/large_tool_results/{sanitized_id}`, returns replacement `ToolMessage` with preview
- `_create_content_preview()` — generates head/tail preview (5 lines each) with truncation marker

Key constants:
```python
TOOLS_EXCLUDED_FROM_EVICTION = ("ls", "glob", "grep", "read_file", "edit_file", "write_file")
NUM_CHARS_PER_TOKEN = 4
tool_token_limit_before_evict = 20000  # ~80K chars
```

Replacement message template:
```
Tool result too large, the result of this tool call {tool_call_id} was saved
in the filesystem at this path: {file_path}
You can read the result from the filesystem by using the read_file tool,
but make sure to only read part of the result at a time.
...
{content_sample}  # head/tail preview
```

---

## 3. Dangling Tool Call Patching

When an AIMessage has `tool_calls` but no corresponding `ToolMessage` responses (e.g. user interrupted mid-stream, or an error occurred), the Anthropic/OpenAI API will reject the next request. DeepAgents patches these before the agent runs.

### What it does

- Runs as a `before_agent` hook on every turn
- Iterates through all messages looking for `AIMessage` objects with `tool_calls`
- For each tool call, checks if a matching `ToolMessage` (by `tool_call_id`) exists later in the history
- If not, injects a synthetic `ToolMessage` saying the tool call was cancelled

### DeepAgents implementation

**File:** `libs/deepagents/deepagents/middleware/patch_tool_calls.py` — `PatchToolCallsMiddleware`

The entire middleware is 45 lines. Core logic:

```python
class PatchToolCallsMiddleware(AgentMiddleware):
    def before_agent(self, state, runtime):
        messages = state["messages"]
        patched_messages = []
        for i, msg in enumerate(messages):
            patched_messages.append(msg)
            if msg.type == "ai" and msg.tool_calls:
                for tool_call in msg.tool_calls:
                    corresponding_tool_msg = next(
                        (msg for msg in messages[i:] if msg.type == "tool"
                         and msg.tool_call_id == tool_call["id"]),
                        None,
                    )
                    if corresponding_tool_msg is None:
                        patched_messages.append(
                            ToolMessage(
                                content=f"Tool call {tool_call['name']} with id "
                                        f"{tool_call['id']} was cancelled - another "
                                        f"message came in before it could be completed.",
                                name=tool_call["name"],
                                tool_call_id=tool_call["id"],
                            )
                        )
        return {"messages": Overwrite(patched_messages)}
```

---

## 4. Anthropic Prompt Caching

Anthropic's prompt caching allows repeated prefixes (system prompt, early conversation turns) to be cached across requests, reducing cost and latency significantly for long conversations.

### What it does

- Marks message content blocks with `cache_control: {"type": "ephemeral"}` so Anthropic caches them
- Cached tokens are charged at 90% discount on subsequent requests and have lower latency
- Most impactful for the system prompt (which is identical every turn) and stable early conversation history

### DeepAgents implementation

**File:** `libs/deepagents/deepagents/graph.py` — included in the middleware stack

DeepAgents uses `AnthropicPromptCachingMiddleware` from `langchain_anthropic.middleware` (not a deepagents-owned middleware, but part of the standard stack):

```python
from langchain_anthropic.middleware import AnthropicPromptCachingMiddleware

deepagent_middleware = [
    # ... other middleware ...
    AnthropicPromptCachingMiddleware(unsupported_model_behavior="ignore"),
    PatchToolCallsMiddleware(),
]
```

The `unsupported_model_behavior="ignore"` flag makes it silently skip when a non-Anthropic model is used. The middleware automatically adds `cache_control: {"type": "ephemeral"}` markers to messages so Anthropic caches repeated prefixes (system prompt, early conversation turns).

For baby-swe in JS, `ChatAnthropic` from `@langchain/anthropic` supports prompt caching natively. You can enable it by either:
1. Setting `cacheControl: true` on the `ChatAnthropic` model constructor (beta auto-caching)
2. Manually adding `cache_control` metadata to system messages and early conversation messages

Reference: https://js.langchain.com/docs/integrations/chat/anthropic/#prompt-caching
