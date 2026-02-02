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
      '• `Cmd/Ctrl+K` - Clear conversation',
      '• `Cmd/Ctrl+T` - New thread',
      '• `Cmd/Ctrl+W` - Close current tab',
      '• `Cmd/Ctrl+1-9` - Switch to tab 1-9',
      '• `Cmd/Ctrl+Alt+←/→` - Switch to prev/next tab',
      '• `Escape` - Cancel current operation',
      '• `Shift+Tab` - Toggle Agent/Plan mode',
      '• `Shift+Enter` - New line in prompt',
      '• `Cmd/Ctrl+O` - Open folder',
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
      `• Input tokens: ${input.toLocaleString()}`,
      `• Output tokens: ${output.toLocaleString()}`,
      `• Total tokens: ${total.toLocaleString()}`,
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
  name: 'yolo',
  description: 'Toggle YOLO mode (bypass all tool approvals)',
  category: 'Actions',
  execute: async (ctx) => {
    const settings = await window.storage.getSettings();
    const newYoloMode = !settings.yoloMode;
    await window.storage.saveSettings({ ...settings, yoloMode: newYoloMode });

    const statusText = newYoloMode
      ? '**YOLO mode enabled** - All tool executions will be auto-approved'
      : '**YOLO mode disabled** - Tool executions will require approval';

    const sessionId = ctx.sessionId || ctx.createSession();
    ctx.addSystemMessage(sessionId, [{ kind: 'text', text: statusText }]);
  },
});
