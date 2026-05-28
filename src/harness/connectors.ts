export type ConnectorStatus = 'available' | 'recommended' | 'missing';

export interface HarnessConnector {
  id: string;
  name: string;
  kind: 'mcp' | 'skill' | 'native';
  status: ConnectorStatus;
  description: string;
  match: RegExp;
}

export const HARNESS_CONNECTORS: HarnessConnector[] = [
  {
    id: 'filesystem',
    name: 'Filesystem tools',
    kind: 'native',
    status: 'available',
    description: 'Read, write, and organize approved local files through the Electron safety harness.',
    match: /file|folder|vault|obsidian|문서|파일|폴더|정리/i,
  },
  {
    id: 'browser',
    name: 'Browser automation',
    kind: 'mcp',
    status: 'recommended',
    description: 'Useful for web login flows, screenshots, and visual inspection.',
    match: /browser|web|site|screenshot|click|브라우저|웹|사이트|클릭|스크린샷/i,
  },
  {
    id: 'github',
    name: 'GitHub connector',
    kind: 'mcp',
    status: 'recommended',
    description: 'Repository issues, pull requests, CI, releases, and code review workflows.',
    match: /github|repo|pull request|issue|ci|깃허브|저장소|이슈|PR/i,
  },
  {
    id: 'calendar',
    name: 'Calendar connector',
    kind: 'mcp',
    status: 'recommended',
    description: 'Scheduling, daily briefs, and meeting preparation.',
    match: /calendar|schedule|meeting|일정|캘린더|회의|예약/i,
  },
  {
    id: 'memory-vault',
    name: 'Memory vault',
    kind: 'native',
    status: 'available',
    description: 'Long-term memory, task archives, and self-reflection records.',
    match: /memory|learn|reflect|vault|기억|학습|반성|성장/i,
  },
];

export function recommendHarnessConnectors(text: string): HarnessConnector[] {
  const matched = HARNESS_CONNECTORS.filter((connector) => connector.match.test(text));
  return matched.length ? matched : HARNESS_CONNECTORS.filter((connector) => connector.status === 'available');
}
