export {
  executeCommand,
  getAllCommands,
  filterCommandsByCategory,
  type CommandContext,
  type Command,
  type CommandCategory,
} from './registry';
import { registerCommand, getAllCommands } from './registry';
import './remember';
import './keys';
import './resume';

registerCommand({
  name: 'clear',
  description: 'Clear the current conversation',
  category: 'Actions',
  execute: (ctx) => {
    if (ctx.sessionId) {
      ctx.clearSession(ctx.sessionId);
    }
  },
});

registerCommand({
  name: 'help',
  description: 'Show available commands and shortcuts',
  category: 'Actions',
  execute: (ctx) => {
    const commands = getAllCommands();
    const lines = commands.map((cmd) => `/${cmd.name} - ${cmd.description}`);

    const helpText = [
      '**Available Commands**',
      '',
      ...lines,
      '',
      '**Keyboard Shortcuts**',
      '- `Cmd/Ctrl+H` - Toggle shortcuts/commands dialog',
      '- `Cmd/Ctrl+1-5` - Switch workspace',
      '- `Opt+Cmd/Ctrl+←/→` - Switch workspace left/right',
      '- `Cmd/Ctrl+A` - New agent tile',
      '- `Cmd/Ctrl+T` - New terminal tile',
      '- `Cmd/Ctrl+Shift+G` - New source control tile',
      '- `Cmd/Ctrl+←/→/↑/↓` - Navigate focused tile',
      '- `Cmd/Ctrl+Shift+←/→/↑/↓` - Move focused tile',
      '- `Cmd/Ctrl+Shift+O` - Toggle focused split orientation',
      '- `Cmd/Ctrl+W` - Close focused tile',
      '- `Escape` - Close shortcuts dialog or cancel active stream',
    ].join('\n');

    const sessionId = ctx.sessionId || ctx.createSession();
    ctx.addSystemMessage(sessionId, [{ kind: 'text', text: helpText }]);
  },
});

registerCommand({
  name: 'tokens',
  description: 'Show token usage for this session',
  category: 'Debug',
  execute: (ctx) => {
    const { input, output, total } = ctx.tokenUsage;

    const tokenText = [
      '**Token Usage**',
      '',
      `- Input tokens: ${input.toLocaleString()}`,
      `- Output tokens: ${output.toLocaleString()}`,
      `- Total tokens: ${total.toLocaleString()}`,
    ].join('\n');

    const sessionId = ctx.sessionId || ctx.createSession();
    ctx.addSystemMessage(sessionId, [{ kind: 'text', text: tokenText }]);
  },
});

registerCommand({
  name: 'new',
  description: 'Start a new conversation thread',
  category: 'Navigation',
  execute: (ctx) => {
    ctx.createSession();
  },
});

registerCommand({
  name: 'model',
  description: 'Switch between available models',
  category: 'Actions',
  execute: () => {},
});

registerCommand({
  name: 'compact',
  description: 'Summarize conversation to free context window space',
  category: 'Actions',
  execute: (ctx) => {
    const sessionId = ctx.sessionId;
    if (!sessionId) return;

    if (ctx.compact) {
      ctx.compact(sessionId);
    }
  },
});
