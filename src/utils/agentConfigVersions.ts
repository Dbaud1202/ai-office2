import type { AgentConfigVersion, AgentConfigSnapshot } from '../types/index.js';

const STORAGE_KEY = 'ao2-agent-config-versions-v1';
const MAX_VERSIONS_PER_AGENT = 10;

function makeId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function loadVersions(): AgentConfigVersion[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveVersionsRaw(versions: AgentConfigVersion[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(versions));
}

export function getVersions(agentId: string): AgentConfigVersion[] {
  return loadVersions()
    .filter((v) => v.agentId === agentId)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function saveVersion(agentId: string, config: AgentConfigSnapshot, label?: string): AgentConfigVersion {
  const allVersions = loadVersions();
  const agentVersions = allVersions.filter((v) => v.agentId === agentId);
  const otherVersions = allVersions.filter((v) => v.agentId !== agentId);

  const version: AgentConfigVersion = {
    id: makeId(),
    agentId,
    config,
    savedAt: new Date().toISOString(),
    label: label ?? `v${agentVersions.length + 1} — ${new Date().toLocaleString('ko-KR')}`,
  };

  // 최대 MAX_VERSIONS_PER_AGENT개 유지 (오래된 것부터 제거)
  const trimmed = [version, ...agentVersions]
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    .slice(0, MAX_VERSIONS_PER_AGENT);

  saveVersionsRaw([...otherVersions, ...trimmed]);
  return version;
}

export function rollbackToVersion(versionId: string): AgentConfigVersion | null {
  const versions = loadVersions();
  return versions.find((v) => v.id === versionId) ?? null;
}

export function deleteVersion(versionId: string): void {
  saveVersionsRaw(loadVersions().filter((v) => v.id !== versionId));
}
