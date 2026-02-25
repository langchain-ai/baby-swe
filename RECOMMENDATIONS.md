# Missing Functionality: DeepAgents → Vanilla LangGraph

## 1. Dangling Tool Call Patching

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

## 2. Anthropic Prompt Caching

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
