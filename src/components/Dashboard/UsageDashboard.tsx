import React, { useMemo, useState } from 'react';
import type { AIProviderId, DailyUsage, ProviderUsageStat } from '../../types/index.js';
import { PLAN_LIMITS } from '../../utils/supabase.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { PROVIDERS, getProviderKey } from '../../utils/providers/index.js';
import {
  clearUsageStore,
  estimateCost,
  getAggregatedUsage,
  getDailyHistory,
  getProviderUsageStat,
  getSessionUsage,
} from '../../utils/usageTracker.js';
import { getMonthlyAiCost, loadBudgetGuardSettings, saveBudgetGuardSettings } from '../../utils/budgetGuard.js';

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ko-KR').format(value);
}

function formatCost(value: number): string {
  if (value === 0) return '$0.00';
  if (value < 0.01) return `< $0.01`;
  return `$${value.toFixed(2)}`;
}

function totalTokens(stat: ProviderUsageStat): number {
  return stat.inputTokens + stat.outputTokens;
}

function totalCost(id: AIProviderId, stat: ProviderUsageStat): number {
  return estimateCost(id, stat.inputTokens, stat.outputTokens);
}

function dayTotal(day: DailyUsage): number {
  return Object.values(day.providers).reduce((sum, stat) => sum + (stat?.messages ?? 0), 0);
}

export default function UsageDashboard() {
  const auth = useAuth();
  const [version, setVersion] = useState(0);
  const [budgetGuard, setBudgetGuard] = useState(() => loadBudgetGuardSettings());
  const sessionUsage = useMemo(() => getSessionUsage(), [version]);
  const monthlyUsage = useMemo(() => getAggregatedUsage(30), [version]);
  const history = useMemo(() => getDailyHistory(7), [version]);
  const planInfo = PLAN_LIMITS[auth.plan];
  const monthlyMessages = Object.values(monthlyUsage).reduce((sum, stat) => sum + (stat?.messages ?? 0), 0);
  const progress =
    planInfo.messageLimit === -1 ? 100 : Math.min((auth.messagesUsed / Math.max(planInfo.messageLimit, 1)) * 100, 100);
  const maxDaily = Math.max(...history.map(dayTotal), 1);
  const monthlyAiCost = getMonthlyAiCost();
  const budgetPercent = budgetGuard.monthlyUsdLimit > 0
    ? Math.min((monthlyAiCost / budgetGuard.monthlyUsdLimit) * 100, 100)
    : 0;

  function updateBudgetGuard(patch: Partial<typeof budgetGuard>) {
    const next = { ...budgetGuard, ...patch };
    setBudgetGuard(next);
    saveBudgetGuardSettings(next);
  }

  function resetUsage() {
    if (!window.confirm('로컬 사용량 기록을 초기화할까요?')) return;
    clearUsageStore();
    setVersion((value) => value + 1);
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <header className="drag-region h-10 flex items-center gap-3 px-5 border-b border-chat-border flex-shrink-0">
        <span className="no-drag text-sm font-semibold text-white">📊 사용량 대시보드</span>
        <button onClick={() => setVersion((value) => value + 1)} className="no-drag btn-ghost ml-auto">
          새로고침
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-5xl space-y-5">
          <section className="panel-card">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-sidebar-muted">이번 달 메시지</p>
                <h2 className="mt-1 text-2xl font-bold text-white">
                  {formatNumber(auth.messagesUsed)}
                  <span className="ml-2 text-sm font-medium text-sidebar-muted">
                    {planInfo.messageLimit === -1 ? '/ 무제한' : `/ ${formatNumber(planInfo.messageLimit)}`}
                  </span>
                </h2>
                <p className="mt-1 text-xs text-sidebar-muted">
                  대시보드 추정 기록: {formatNumber(monthlyMessages)}회
                </p>
              </div>
              <div className="w-full sm:w-64">
                <div className="h-2 overflow-hidden rounded-full bg-sidebar-hover">
                  <div className="h-full rounded-full bg-brand-primary" style={{ width: `${progress}%` }} />
                </div>
                <p className="mt-2 text-right text-xs text-sidebar-muted">{PLAN_LIMITS[auth.plan].label}</p>
              </div>
            </div>
          </section>

          <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {PROVIDERS.map((provider) => {
              const connected = Boolean(getProviderKey(provider.id));
              return (
                <div key={provider.id} className="rounded-lg border border-chat-border bg-[#222529] p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{provider.icon}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{provider.name}</span>
                    <span className={`text-xs ${connected ? 'text-emerald-400' : 'text-sidebar-muted'}`}>
                      {connected ? '연결됨' : '미연결'}
                    </span>
                  </div>
                </div>
              );
            })}
          </section>

          <section className="panel-card">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white">AI 비용 가드</h3>
                <p className="mt-1 text-xs text-sidebar-muted">채팅 실행 전에 월 예산 초과 위험을 경고하거나 차단합니다.</p>
              </div>
              <span className="text-sm font-semibold text-emerald-400">{formatCost(monthlyAiCost)}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs text-sidebar-muted">
                월 한도 USD
                <input
                  type="number"
                  min={0}
                  value={budgetGuard.monthlyUsdLimit}
                  onChange={(event) => updateBudgetGuard({ monthlyUsdLimit: Number(event.target.value) })}
                  className="message-input mt-1 py-2"
                />
              </label>
              <label className="text-xs text-sidebar-muted">
                경고 기준 %
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={budgetGuard.warnAtPercent}
                  onChange={(event) => updateBudgetGuard({ warnAtPercent: Number(event.target.value) })}
                  className="message-input mt-1 py-2"
                />
              </label>
              <label className="mt-5 flex items-center gap-2 text-sm text-sidebar-text">
                <input
                  type="checkbox"
                  checked={budgetGuard.blockAtLimit}
                  onChange={(event) => updateBudgetGuard({ blockAtLimit: event.target.checked })}
                />
                한도 초과 시 실행 차단
              </label>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-sidebar-hover">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${budgetPercent}%` }} />
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PROVIDERS.map((provider) => {
              const stat = getProviderUsageStat(sessionUsage, provider.id);
              const cost = totalCost(provider.id, stat);
              return (
                <div key={provider.id} className="panel-card">
                  <div className="mb-4 flex items-center gap-2">
                    <span className="text-lg">{provider.icon}</span>
                    <h3 className="text-sm font-semibold text-white">{provider.name}</h3>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-sidebar-muted">세션 요청</p>
                      <p className="text-xl font-bold text-white">{formatNumber(stat.messages)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-sidebar-muted">토큰</p>
                      <p className="text-sm font-semibold text-white">{formatNumber(totalTokens(stat))}</p>
                    </div>
                    <div>
                      <p className="text-xs text-sidebar-muted">비용</p>
                      <p className="text-sm font-semibold text-emerald-400">
                        {formatCost(stat.cost != null ? stat.cost : cost)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>

          <section className="panel-card">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">최근 7일 요청 수</h3>
                <p className="mt-1 text-xs text-sidebar-muted">API 에이전트 호출 기준 로컬 추정치입니다.</p>
              </div>
              <button onClick={resetUsage} className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300 hover:bg-red-500/20">
                데이터 초기화
              </button>
            </div>

            {history.every((d) => dayTotal(d) === 0) ? (
              <div className="flex h-44 items-center justify-center rounded-lg border border-dashed border-chat-border text-sm text-sidebar-muted">
                아직 기록된 사용량이 없습니다.
              </div>
            ) : (
              <div className="flex h-52 items-end gap-2">
                {history.map((day) => {
                  const messages = dayTotal(day);
                  return (
                    <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                      <div className="flex h-40 w-full items-end rounded bg-sidebar-hover/40 px-2">
                        <div
                          className="w-full rounded-t bg-brand-primary"
                          style={{ height: `${Math.max((messages / maxDaily) * 100, 4)}%` }}
                          title={`${day.date}: ${messages}회`}
                        />
                      </div>
                      <span className="text-xs text-white">{formatNumber(messages)}</span>
                      <span className="max-w-full truncate text-[11px] text-sidebar-muted">
                        {new Date(day.date).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
