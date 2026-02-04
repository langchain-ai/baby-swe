import { registerCommand } from './registry';

registerCommand({
  name: 'keys',
  description: 'Manage API keys',
  category: 'Actions',
  execute: (ctx) => {
    if (ctx.setShowApiKeysScreen) {
      ctx.setShowApiKeysScreen(true);
    }
  },
});
