import { registerCommand } from './registry';

const REMEMBER_PROMPT = `Please analyze our conversation and identify any important patterns, preferences, or learnings that should be remembered for future sessions.

Update the AGENTS.md file at:
- ~/.baby-swe/AGENTS.md for global preferences (applies to all projects)
- AGENTS.md in the project root for project-specific instructions

Include things like:
- Coding style preferences
- Project-specific patterns and conventions
- Workflow preferences
- Architecture decisions
- Any other persistent context

Focus on lasting preferences, not transient task details. Use the edit_file or write_file tool to update the appropriate file. Create the file if it doesn't exist.`;

registerCommand({
  name: 'remember',
  description: 'Save learnings and preferences to AGENTS.md',
  category: 'Actions',
  execute: (ctx, args) => {
    if (!ctx.sendAgentPrompt) {
      ctx.addSystemMessage(ctx.sessionId!, [
        { kind: 'text', text: 'Error: sendAgentPrompt not available' },
      ]);
      return;
    }

    const additionalContext = args.join(' ').trim();
    const prompt = additionalContext
      ? `${REMEMBER_PROMPT}\n\n**Additional context from user:** ${additionalContext}`
      : REMEMBER_PROMPT;

    ctx.sendAgentPrompt(prompt);
  },
});
