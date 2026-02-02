import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export function loadAgentMemory(rootDir?: string): string | null {
  const sections: string[] = [];

  const userMemoryPath = path.join(os.homedir(), '.baby-swe', 'AGENTS.md');
  if (fs.existsSync(userMemoryPath)) {
    try {
      const content = fs.readFileSync(userMemoryPath, 'utf-8');
      if (content.trim()) {
        sections.push(`### User Preferences\n${content}`);
      }
    } catch {}
  }

  if (rootDir) {
    const projectMemoryPath = path.join(rootDir, 'AGENTS.md');
    if (fs.existsSync(projectMemoryPath)) {
      try {
        const content = fs.readFileSync(projectMemoryPath, 'utf-8');
        if (content.trim()) {
          sections.push(`### Project Instructions\n${content}`);
        }
      } catch {}
    }
  }

  return sections.length > 0 ? sections.join('\n\n') : null;
}
