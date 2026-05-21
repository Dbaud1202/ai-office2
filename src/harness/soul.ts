import fs from 'fs/promises';
import path from 'path';

// Resolves relative to the project root (process.cwd()) so it works regardless
// of where TypeScript compiles the output.
function soulsDir(): string {
  return path.resolve(process.cwd(), 'agent-core', 'souls');
}

const cache = new Map<string, string>();

export async function loadSoul(agentId: string): Promise<string> {
  if (cache.has(agentId)) return cache.get(agentId)!;
  try {
    const content = await fs.readFile(path.join(soulsDir(), `${agentId}.md`), 'utf-8');
    cache.set(agentId, content);
    return content;
  } catch {
    return ''; // No soul file — graceful pass-through
  }
}

export function clearSoulCache(): void {
  cache.clear();
}
