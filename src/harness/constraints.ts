const VAULT_TOOLS = [
  'vault_read_note',
  'vault_write_note',
  'vault_search_notes',
  'vault_list_notes',
  'vault_append_note',
  'vault_note_exists',
];

// Tool permission matrix — defines what each agent role is allowed to call.
// Unknown agents fall back to allow-all for graceful degradation.
const AGENT_TOOL_PERMISSIONS: Record<string, string[]> = {
  pm: [
    ...VAULT_TOOLS,
    'delegate_to_researcher',
    'delegate_to_developer',
    'delegate_to_writer',
  ],
  researcher: [
    ...VAULT_TOOLS,
    'web_search',
    'web_fetch',
  ],
  developer: [
    ...VAULT_TOOLS,
    'read_file',
    'write_file',
    'list_directory',
  ],
  writer: [
    ...VAULT_TOOLS,
  ],
};

export function checkToolPermission(agentId: string, toolName: string): boolean {
  const allowed = AGENT_TOOL_PERMISSIONS[agentId];
  if (!allowed) return true; // Unknown agent — allow all
  return allowed.includes(toolName);
}

export function getAllowedTools(agentId: string): string[] {
  return AGENT_TOOL_PERMISSIONS[agentId] ?? [];
}

export function getDeniedReason(agentId: string, toolName: string): string {
  return `[하네스 권한 오류] 에이전트 '${agentId}'는 도구 '${toolName}' 사용 권한이 없습니다.`;
}
