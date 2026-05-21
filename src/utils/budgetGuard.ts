import type { AIProviderId } from '../types/index.js';
import { estimateCost, getAggregatedUsage } from './usageTracker.js';

const STORAGE_KEY = 'ao2-budget-guard-v1';

export interface BudgetGuardSettings {
  monthlyUsdLimit: number;
  warnAtPercent: number;
  blockAtLimit: boolean;
}

export interface BudgetGuardResult {
  usedUsd: number;
  estimatedUsd: number;
  projectedUsd: number;
  limitUsd: number;
  percent: number;
  status: 'ok' | 'warn' | 'blocked';
  message: string;
}

const DEFAULT_SETTINGS: BudgetGuardSettings = {
  monthlyUsdLimit: 20,
  warnAtPercent: 80,
  blockAtLimit: false,
};

export function loadBudgetGuardSettings(): BudgetGuardSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveBudgetGuardSettings(settings: BudgetGuardSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function getMonthlyAiCost(): number {
  const usage = getAggregatedUsage(30);
  return Object.values(usage).reduce((sum, stat) => sum + (stat?.cost ?? 0), 0);
}

export function checkBudgetGuard(params: {
  providerId: AIProviderId;
  inputChars: number;
  outputChars?: number;
}): BudgetGuardResult {
  const settings = loadBudgetGuardSettings();
  const inputTokens = Math.ceil(Math.max(params.inputChars, 0) / 4);
  const outputTokens = Math.ceil(Math.max(params.outputChars ?? 2500, 0) / 4);
  const estimatedUsd = estimateCost(params.providerId, inputTokens, outputTokens);
  const usedUsd = getMonthlyAiCost();
  const projectedUsd = usedUsd + estimatedUsd;
  const limitUsd = Math.max(settings.monthlyUsdLimit, 0);
  const percent = limitUsd > 0 ? (projectedUsd / limitUsd) * 100 : 0;
  const blocked = settings.blockAtLimit && limitUsd > 0 && projectedUsd >= limitUsd;
  const warned = !blocked && limitUsd > 0 && percent >= settings.warnAtPercent;

  return {
    usedUsd,
    estimatedUsd,
    projectedUsd,
    limitUsd,
    percent,
    status: blocked ? 'blocked' : warned ? 'warn' : 'ok',
    message: blocked
      ? `AI budget limit reached. Projected monthly cost is $${projectedUsd.toFixed(2)}.`
      : warned
        ? `AI budget warning: projected monthly cost is $${projectedUsd.toFixed(2)}.`
        : `Projected monthly AI cost is $${projectedUsd.toFixed(2)}.`,
  };
}
