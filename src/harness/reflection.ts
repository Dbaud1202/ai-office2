import type { HarnessDecision } from './router.js';

export interface HarnessReflection {
  id: string;
  createdAt: string;
  agentId: string;
  prompt: string;
  outputPreview: string;
  difficulty: HarnessDecision['difficulty'];
  route: HarnessDecision['route'];
  workerIds: string[];
  lessons: string[];
  score: number;
}

export interface HarnessStats {
  totalRuns: number;
  averageScore: number;
  routeCounts: Record<string, number>;
  difficultyCounts: Record<string, number>;
  recentLessons: string[];
}

const STORAGE_KEY = 'ao2-harness-reflections-v1';
const MAX_REFLECTIONS = 80;

function safeStorage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

export function loadHarnessReflections(): HarnessReflection[] {
  const storage = safeStorage();
  if (!storage) return [];
  try {
    return JSON.parse(storage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function saveHarnessReflections(items: HarnessReflection[]) {
  const storage = safeStorage();
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_REFLECTIONS)));
}

function lessonFromRun(prompt: string, output: string, decision: HarnessDecision): string[] {
  const lessons: string[] = [];
  if (decision.route === 'fast' && output.length > 1200) {
    lessons.push('Fast route produced a long answer; bias shorter next time.');
  }
  if (decision.needsConnector) {
    lessons.push('Connector intent detected; surface available MCP/tool options early.');
  }
  if (decision.route === 'debate') {
    lessons.push('Debate route used; collapse repeated opinions into an execution decision.');
  }
  if (/error|failed|blocked|오류|실패|막힘/i.test(output)) {
    lessons.push('Run hit an error or blocker; ask for the missing authority or evidence earlier.');
  }
  if (lessons.length === 0) {
    lessons.push(`Route ${decision.route} matched task difficulty ${decision.difficulty}.`);
  }
  if (prompt.length > 1500) {
    lessons.push('Large prompt detected; summarize inputs before the next model call.');
  }
  return lessons;
}

function scoreRun(output: string, decision: HarnessDecision): number {
  let score = 72;
  if (output.trim().length > 80) score += 8;
  if (decision.route === 'fast' && output.length < 1200) score += 8;
  if (decision.route === 'debate' && /decision|결정|next|다음|실행/i.test(output)) score += 6;
  if (/error|failed|blocked|오류|실패|막힘/i.test(output)) score -= 18;
  if (decision.riskFlags.length > 0 && /risk|주의|위험|확인/i.test(output)) score += 4;
  return Math.max(0, Math.min(100, score));
}

export function recordHarnessReflection(params: {
  agentId: string;
  prompt: string;
  output: string;
  decision: HarnessDecision;
}): HarnessReflection {
  const reflection: HarnessReflection = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    agentId: params.agentId,
    prompt: params.prompt.slice(0, 500),
    outputPreview: params.output.slice(0, 600),
    difficulty: params.decision.difficulty,
    route: params.decision.route,
    workerIds: params.decision.workerIds,
    lessons: lessonFromRun(params.prompt, params.output, params.decision),
    score: scoreRun(params.output, params.decision),
  };
  saveHarnessReflections([reflection, ...loadHarnessReflections()]);
  return reflection;
}

export function summarizeHarnessStats(reflections: HarnessReflection[] = loadHarnessReflections()): HarnessStats {
  const routeCounts: Record<string, number> = {};
  const difficultyCounts: Record<string, number> = {};
  let scoreTotal = 0;
  const lessons: string[] = [];

  for (const item of reflections) {
    routeCounts[item.route] = (routeCounts[item.route] ?? 0) + 1;
    difficultyCounts[item.difficulty] = (difficultyCounts[item.difficulty] ?? 0) + 1;
    scoreTotal += item.score;
    for (const lesson of item.lessons) {
      if (!lessons.includes(lesson)) lessons.push(lesson);
    }
  }

  return {
    totalRuns: reflections.length,
    averageScore: reflections.length ? Math.round(scoreTotal / reflections.length) : 0,
    routeCounts,
    difficultyCounts,
    recentLessons: lessons.slice(0, 8),
  };
}
