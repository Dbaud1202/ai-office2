export type HarnessDifficulty = 'trivial' | 'simple' | 'standard' | 'complex' | 'critical';
export type HarnessRoute = 'fast' | 'direct' | 'workroom' | 'debate';

export interface HarnessDecision {
  difficulty: HarnessDifficulty;
  route: HarnessRoute;
  confidence: number;
  workerIds: string[];
  maxRounds: number;
  needsReflection: boolean;
  needsConnector: boolean;
  riskFlags: string[];
  reasons: string[];
}

const WORKER_RULES: Array<{ id: string; pattern: RegExp }> = [
  { id: 'researcher', pattern: /research|market|trend|competitor|source|evidence|citation|investigate|조사|시장|근거|자료|검색|리서치|분석/i },
  { id: 'developer', pattern: /code|bug|build|api|mcp|sdk|electron|react|typescript|test|deploy|코드|개발|버그|빌드|배포|테스트|구현|수정|연결/i },
  { id: 'writer', pattern: /write|copy|blog|readme|doc|proposal|report|정리|문서|글|보고서|기획|카피|요약/i },
  { id: 'analyst', pattern: /metric|kpi|cost|budget|forecast|dashboard|data|지표|비용|예산|매출|통계|데이터/i },
];

const COMPLEX_PATTERNS = [
  /architecture|migration|security|permission|automation|orchestrat|multi-agent|harness|agentic/i,
  /아키텍처|보안|권한|자동화|자동|오케스트|멀티.?에이전트|하네스|자가반성|성장|토론|리뷰/i,
];

const CRITICAL_PATTERNS = [
  /delete|remove|payment|credential|secret|private key|production|publish|push|deploy/i,
  /삭제|결제|비밀번호|시크릿|개인키|프로덕션|운영|푸시|배포|커밋/i,
];

const CONNECTOR_PATTERNS = [
  /mcp|connector|plugin|calendar|github|browser|notion|slack|discord|drive|sheet|gmail/i,
  /연결|커넥터|플러그인|캘린더|깃허브|브라우저|디스코드|시트|메일/i,
];

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function countMatches(text: string, patterns: RegExp[]) {
  return patterns.reduce((sum, pattern) => sum + (pattern.test(text) ? 1 : 0), 0);
}

export function inferHarnessWorkers(text: string): string[] {
  const workers = WORKER_RULES.filter((rule) => rule.pattern.test(text)).map((rule) => rule.id);
  if (workers.length === 0) return ['researcher', 'writer'];
  return unique(workers);
}

export function classifyHarnessTask(text: string): HarnessDecision {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/).filter(Boolean).length;
  const complexScore = countMatches(trimmed, COMPLEX_PATTERNS);
  const criticalScore = countMatches(trimmed, CRITICAL_PATTERNS);
  const needsConnector = CONNECTOR_PATTERNS.some((pattern) => pattern.test(trimmed));
  const workerIds = inferHarnessWorkers(trimmed);
  const wantsDebate = /debate|discuss|compare|tradeoff|회의|토론|비교|의견|판단/.test(trimmed);
  const wantsFast = /quick|fast|brief|just|바로|빠르게|간단|요약만|정리만/.test(trimmed);

  let difficulty: HarnessDifficulty = 'standard';
  if (words <= 4 && !complexScore && !criticalScore) difficulty = 'trivial';
  else if (words <= 14 && !complexScore && !criticalScore) difficulty = 'simple';
  else if (criticalScore > 0 && complexScore > 0) difficulty = 'critical';
  else if (criticalScore > 0 || complexScore >= 2 || workerIds.length >= 3) difficulty = 'complex';

  let route: HarnessRoute = 'direct';
  if (difficulty === 'trivial' || (difficulty === 'simple' && wantsFast)) route = 'fast';
  else if (difficulty === 'complex' || difficulty === 'critical' || wantsDebate || workerIds.length >= 3 || (needsConnector && complexScore > 0)) route = 'debate';
  else if (workerIds.length > 1 || needsConnector) route = 'workroom';

  const riskFlags = [
    criticalScore > 0 ? 'high-impact action' : '',
    needsConnector ? 'connector/tool integration' : '',
    complexScore > 0 ? 'architecture or orchestration' : '',
  ].filter(Boolean);

  const reasons = [
    `${words} words`,
    `${workerIds.length} worker lane(s)`,
    needsConnector ? 'connector likely needed' : 'no connector required',
    wantsFast ? 'user asked for speed' : '',
    wantsDebate ? 'user asked for discussion' : '',
  ].filter(Boolean);

  return {
    difficulty,
    route,
    confidence: Math.min(0.95, 0.55 + complexScore * 0.12 + workerIds.length * 0.06 + (needsConnector ? 0.08 : 0)),
    workerIds,
    maxRounds: route === 'fast' ? 1 : route === 'direct' ? 3 : route === 'workroom' ? 8 : 16,
    needsReflection: difficulty !== 'trivial',
    needsConnector,
    riskFlags,
    reasons,
  };
}

export function shouldDebate(decision: HarnessDecision): boolean {
  return decision.route === 'debate';
}

export function buildHarnessRunBrief(decision: HarnessDecision): string {
  return [
    '[Harness routing]',
    `- Difficulty: ${decision.difficulty}`,
    `- Route: ${decision.route}`,
    `- Confidence: ${Math.round(decision.confidence * 100)}%`,
    `- Worker lanes: ${decision.workerIds.join(', ') || 'none'}`,
    `- Max rounds: ${decision.maxRounds}`,
    decision.needsConnector ? '- Connector/MCP-like tool surface may be useful.' : '- No connector is required unless evidence changes.',
    decision.riskFlags.length ? `- Risk flags: ${decision.riskFlags.join(', ')}` : '- Risk flags: none',
    '- If the route is fast/direct, answer without ceremonial debate.',
    '- If the route is workroom/debate, expose tradeoffs briefly and assign concrete next actions.',
    '- End with a short self-check: what was decided, what evidence is missing, and what should improve next time.',
  ].join('\n');
}
