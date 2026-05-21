import type { VaultAPI } from '../memory/vault.js';
import { HARNESS_CONFIG } from './config.js';

function memPath(agentId: string): string {
  return `에이전트-로그/${agentId}/MEMORY.md`;
}

export async function loadAgentMemory(agentId: string, vault: VaultAPI): Promise<string> {
  const note = await vault.readNote(memPath(agentId));
  return note?.content.trim() ?? '';
}

export async function saveAgentInsight(
  agentId: string,
  vault: VaultAPI,
  insight: string
): Promise<void> {
  const clipped = insight.slice(0, HARNESS_CONFIG.memory.insightMaxLength).replace(/\n/g, ' ');
  if (!clipped.trim()) return;

  const entry = `- [${new Date().toISOString().split('T')[0]}] ${clipped}`;
  const note = await vault.readNote(memPath(agentId));

  if (!note) {
    await vault.writeNote(
      memPath(agentId),
      `## ${agentId} 에이전트 장기기억\n\n${entry}\n`,
      { title: `${agentId} MEMORY`, type: 'agent-memory', agentId }
    );
    return;
  }

  // Keep only the last N insight lines to prevent unbounded growth
  const insightLines = note.content
    .split('\n')
    .filter((l) => l.startsWith('- ['));
  const kept = insightLines.slice(-(HARNESS_CONFIG.memory.maxInsightLines - 1));

  const header = note.content
    .split('\n')
    .filter((l) => !l.startsWith('- ['))
    .join('\n')
    .trim();

  const newContent = `${header}\n\n${[...kept, entry].join('\n')}\n`;
  await vault.writeNote(memPath(agentId), newContent, note.frontmatter);
}

export async function buildMemoryContext(agentId: string, vault: VaultAPI): Promise<string> {
  const memory = await loadAgentMemory(agentId, vault);
  if (!memory) return '';
  return `\n\n## 내 장기기억 (이전 세션 누적 학습)\n${memory}`;
}
