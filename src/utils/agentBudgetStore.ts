import type { AgentBudget } from '../types/index.js';
import type { AIProviderId } from '../types/index.js';
import { estimateCost } from './usageTracker.js';

export const STORAGE_KEY = 'ao2-agent-budgets-v1';
const AGENT_COST_KEY = 'ao2-agent-costs-v1';

// ── Per-agent cost tracking (separate from global UsageStore) ─────────────────

interface AgentCostEntry {
  agentId: string;
  month: string; // YYYY-MM
  costUsd: number;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function loadAgentCosts(): AgentCostEntry[] {
  try {
    return JSON.parse(localStorage.getItem(AGENT_COST_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveAgentCosts(costs: AgentCostEntry[]): void {
  // 현재 달과 이전 달 데이터만 보관 (Date 기반으로 1월 엣지 케이스 안전 처리)
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 1);
  const cutoffMonth = cutoff.toISOString().slice(0, 7);
  const pruned = costs.filter((c) => c.month >= cutoffMonth);
  localStorage.setItem(AGENT_COST_KEY, JSON.stringify(pruned));
}

export function recordAgentCost(agentId: string, costUsd: number): void {
  if (costUsd <= 0) return;
  const costs = loadAgentCosts();
  const month = currentMonth();
  const idx = costs.findIndex((c) => c.agentId === agentId && c.month === month);
  if (idx >= 0) {
    costs[idx].costUsd += costUsd;
  } else {
    costs.push({ agentId, month, costUsd });
  }
  saveAgentCosts(costs);
}

export function getAgentMonthlyCost(agentId: string): number {
  const month = currentMonth();
  return loadAgentCosts()
    .filter((c) => c.agentId === agentId && c.month === month)
    .reduce((sum, c) => sum + c.costUsd, 0);
}

export function loadAgentBudgets(): AgentBudget[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function saveAgentBudgets(budgets: AgentBudget[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(budgets));
}

export function getAgentBudget(agentId: string): AgentBudget | undefined {
  return loadAgentBudgets().find((b) => b.agentId === agentId);
}

export function setAgentBudget(budget: AgentBudget): void {
  const budgets = loadAgentBudgets().filter((b) => b.agentId !== budget.agentId);
  saveAgentBudgets([...budgets, budget]);
}

export function removeAgentBudget(agentId: string): void {
  saveAgentBudgets(loadAgentBudgets().filter((b) => b.agentId !== agentId));
}

export interface AgentBudgetResult {
  usedUsd: number;
  estimatedUsd: number;
  projectedUsd: number;
  limitUsd: number;
  percent: number;
  status: 'ok' | 'warn' | 'blocked';
  message: string;
}

export function checkAgentBudget(
  agentId: string,
  providerId: AIProviderId,
  inputChars: number,
  outputChars = 2500
): AgentBudgetResult {
  const budget = getAgentBudget(agentId);

  const inputTokens = Math.ceil(Math.max(inputChars, 0) / 4);
  const outputTokens = Math.ceil(Math.max(outputChars, 0) / 4);
  const estimatedUsd = estimateCost(providerId, inputTokens, outputTokens);

  if (!budget) {
    return {
      usedUsd: 0,
      estimatedUsd,
      projectedUsd: estimatedUsd,
      limitUsd: 0,
      percent: 0,
      status: 'ok',
      message: '에이전트 예산 미설정',
    };
  }

  // 에이전트별 월간 누적 비용 (전체 앱 비용이 아닌 이 에이전트 전용)
  const usedUsd = getAgentMonthlyCost(agentId);
  const projectedUsd = usedUsd + estimatedUsd;
  const limitUsd = Math.max(budget.monthlyUsdLimit, 0);
  const percent = limitUsd > 0 ? (projectedUsd / limitUsd) * 100 : 0;
  const blocked = budget.blockAtLimit && limitUsd > 0 && projectedUsd >= limitUsd;
  const warned = !blocked && limitUsd > 0 && percent >= budget.warnAtPercent;

  return {
    usedUsd,
    estimatedUsd,
    projectedUsd,
    limitUsd,
    percent,
    status: blocked ? 'blocked' : warned ? 'warn' : 'ok',
    message: blocked
      ? `[${agentId}] 월간 예산 초과. 예상 비용 $${projectedUsd.toFixed(2)} / 한도 $${limitUsd.toFixed(2)}`
      : warned
        ? `[${agentId}] 예산 경고: 예상 $${projectedUsd.toFixed(2)} / $${limitUsd.toFixed(2)}`
        : `[${agentId}] 예산 정상: $${projectedUsd.toFixed(2)} / $${limitUsd.toFixed(2)}`,
  };
}
