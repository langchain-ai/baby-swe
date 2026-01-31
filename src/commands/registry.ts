import type { Chunk } from '../types';

export type CommandCategory = 'Actions' | 'Navigation' | 'Debug';

export interface CommandContext {
  sessionId: string | null;
  createSession: () => string;
  clearSession: (sessionId: string) => void;
  addSystemMessage: (sessionId: string, chunks: Chunk[]) => void;
  tokenUsage: { input: number; output: number; total: number };
}

export interface Command {
  name: string;
  description: string;
  category: CommandCategory;
  execute: (ctx: CommandContext, args: string[]) => void;
}

const commands: Map<string, Command> = new Map();

export function registerCommand(command: Command) {
  commands.set(command.name, command);
}

export function getCommand(name: string): Command | undefined {
  return commands.get(name);
}

export function getAllCommands(): Command[] {
  return Array.from(commands.values());
}

export function getCommandsByCategory(): Map<CommandCategory, Command[]> {
  const grouped = new Map<CommandCategory, Command[]>();
  for (const cmd of commands.values()) {
    const list = grouped.get(cmd.category) || [];
    list.push(cmd);
    grouped.set(cmd.category, list);
  }
  return grouped;
}

export function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

export function filterCommands(query: string): Command[] {
  if (!query) return getAllCommands();
  return getAllCommands().filter((cmd) => fuzzyMatch(query, cmd.name));
}

export function filterCommandsByCategory(query: string): Map<CommandCategory, Command[]> {
  const filtered = filterCommands(query);
  const grouped = new Map<CommandCategory, Command[]>();
  for (const cmd of filtered) {
    const list = grouped.get(cmd.category) || [];
    list.push(cmd);
    grouped.set(cmd.category, list);
  }
  return grouped;
}

export function parseCommand(input: string): { name: string; args: string[] } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;

  const parts = trimmed.slice(1).split(/\s+/);
  const name = parts[0]?.toLowerCase();
  if (!name) return null;

  return { name, args: parts.slice(1) };
}

export function executeCommand(input: string, ctx: CommandContext): boolean {
  const parsed = parseCommand(input);
  if (!parsed) return false;

  const command = getCommand(parsed.name);
  if (!command) return false;

  command.execute(ctx, parsed.args);
  return true;
}
