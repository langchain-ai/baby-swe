import { registerCommand } from './registry';

registerCommand({
  name: 'resume',
  description: 'Resume a previous conversation',
  category: 'Navigation',
  execute: (ctx) => {
    if (!ctx.project) {
      const sessionId = ctx.sessionId || ctx.createSession();
      ctx.addSystemMessage(sessionId, [
        { kind: 'text', text: 'No project open. Open a folder first to access chat history.' },
      ]);
      return;
    }

    if (ctx.showThreadPicker) {
      ctx.showThreadPicker();
    }
  },
});
