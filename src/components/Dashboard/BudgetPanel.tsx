import React, { useState } from 'react';
import type { BudgetEntry } from '../../types/index.js';
import { useAgents } from '../../contexts/AgentContext.js';
import {
  loadAgentBudgets,
  setAgentBudget,
  removeAgentBudget,
} from '../../utils/agentBudgetStore.js';

const STORAGE_KEY = 'ao2-budget';
function load(): BudgetEntry[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); } catch { return []; }
}
function save(b: BudgetEntry[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(b)); } catch {}
}
function makeId() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function now() { return new Date().toISOString(); }

const CATEGORIES = ['인프라', '마케팅', '개발', '운영', '기타'];

const CATEGORY_COLORS: Record<string, string> = {
  '인프라': 'bg-blue-900 text-blue-300',
  '마케팅': 'bg-pink-900 text-pink-300',
  '개발': 'bg-purple-900 text-purple-300',
  '운영': 'bg-orange-900 text-orange-300',
  '기타': 'bg-gray-700 text-gray-300',
};

export default function BudgetPanel() {
  const { agents } = useAgents();
  const [entries, setEntries] = useState<BudgetEntry[]>(load);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ description: '', amount: '', category: '기타', type: 'expense' as BudgetEntry['type'] });
  const [agentBudgets, setAgentBudgetsState] = useState(loadAgentBudgets);
  const [agentBudgetForm, setAgentBudgetForm] = useState<Record<string, { limit: string; warn: string; block: boolean }>>({});

  const totalIncome = entries.filter((e) => e.type === 'income').reduce((s, e) => s + e.amount, 0);
  const totalExpense = entries.filter((e) => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
  const balance = totalIncome - totalExpense;

  const addEntry = () => {
    const amt = parseFloat(form.amount);
    if (!form.description.trim() || isNaN(amt) || amt <= 0) return;
    const e: BudgetEntry = {
      id: makeId(), description: form.description, amount: amt,
      category: form.category, type: form.type, date: now(),
    };
    const next = [e, ...entries]; setEntries(next); save(next);
    setForm({ description: '', amount: '', category: '기타', type: 'expense' });
    setShowAdd(false);
  };

  const deleteEntry = (id: string) => {
    const next = entries.filter((e) => e.id !== id); setEntries(next); save(next);
  };

  const fmt = (n: number) => new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(n);

  const byCategory = CATEGORIES.map((cat) => ({
    name: cat,
    total: entries.filter((e) => e.category === cat && e.type === 'expense').reduce((s, e) => s + e.amount, 0),
  })).filter((c) => c.total > 0);

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <header className="drag-region h-10 flex items-center gap-3 px-5 border-b border-chat-border flex-shrink-0">
        <span className="no-drag text-sm font-semibold text-white">💰 예산 관리</span>
        <button onClick={() => setShowAdd(true)} className="no-drag btn-primary ml-auto">+ 항목 추가</button>
      </header>

      {showAdd && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowAdd(false)}>
          <div className="bg-[#222529] rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-semibold mb-4">새 예산 항목</h3>
            <div className="space-y-3">
              <div className="flex gap-2">
                <button onClick={() => setForm({ ...form, type: 'expense' })} className={`flex-1 py-2 rounded-lg text-sm font-medium ${form.type === 'expense' ? 'bg-red-600 text-white' : 'bg-sidebar-hover text-sidebar-text'}`}>지출</button>
                <button onClick={() => setForm({ ...form, type: 'income' })} className={`flex-1 py-2 rounded-lg text-sm font-medium ${form.type === 'income' ? 'bg-emerald-600 text-white' : 'bg-sidebar-hover text-sidebar-text'}`}>수입</button>
              </div>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="설명 *" className="message-input w-full" />
              <input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="금액 (원) *" type="number" className="message-input w-full" />
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="message-input w-full">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowAdd(false)} className="btn-ghost">취소</button>
                <button onClick={addEntry} className="btn-primary">추가</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#222529] rounded-xl p-4">
            <p className="text-xs text-sidebar-muted mb-1">총 수입</p>
            <p className="text-lg font-bold text-emerald-400">{fmt(totalIncome)}</p>
          </div>
          <div className="bg-[#222529] rounded-xl p-4">
            <p className="text-xs text-sidebar-muted mb-1">총 지출</p>
            <p className="text-lg font-bold text-red-400">{fmt(totalExpense)}</p>
          </div>
          <div className="bg-[#222529] rounded-xl p-4">
            <p className="text-xs text-sidebar-muted mb-1">잔액</p>
            <p className={`text-lg font-bold ${balance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(balance)}</p>
          </div>
        </div>

        {/* Category breakdown */}
        {byCategory.length > 0 && (
          <div className="bg-[#222529] rounded-xl p-4">
            <p className="text-xs font-semibold text-sidebar-muted uppercase tracking-wider mb-3">카테고리별 지출</p>
            <div className="space-y-2">
              {byCategory.sort((a, b) => b.total - a.total).map((cat) => (
                <div key={cat.name} className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${CATEGORY_COLORS[cat.name] ?? 'bg-gray-700 text-gray-300'}`}>{cat.name}</span>
                  <div className="flex-1 bg-sidebar-hover rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full bg-brand-primary rounded-full"
                      style={{ width: `${Math.min((cat.total / totalExpense) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-white font-medium">{fmt(cat.total)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transaction list */}
        <div className="bg-[#222529] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-chat-border">
            <p className="text-xs font-semibold text-sidebar-muted uppercase tracking-wider">거래 내역</p>
          </div>
          {entries.length === 0 ? (
            <div className="p-8 text-center text-sidebar-muted text-sm">항목을 추가하세요</div>
          ) : (
            <div className="divide-y divide-chat-border">
              {entries.map((e) => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-3 group hover:bg-sidebar-hover/30">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{e.description}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${CATEGORY_COLORS[e.category] ?? 'bg-gray-700 text-gray-300'}`}>{e.category}</span>
                      <span className="text-xs text-sidebar-muted">{new Date(e.date).toLocaleDateString('ko-KR')}</span>
                    </div>
                  </div>
                  <span className={`text-sm font-semibold flex-shrink-0 ${e.type === 'income' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {e.type === 'income' ? '+' : '-'}{fmt(e.amount)}
                  </span>
                  <button onClick={() => deleteEntry(e.id)} className="opacity-0 group-hover:opacity-100 text-sidebar-muted hover:text-red-400 text-xs ml-1">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 에이전트별 AI 예산 (US-001) ── */}
        <div className="bg-[#222529] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-chat-border">
            <p className="text-xs font-semibold text-sidebar-muted uppercase tracking-wider">에이전트별 AI 예산 한도</p>
            <p className="text-xs text-sidebar-muted mt-0.5">에이전트마다 월간 AI 사용 예산을 설정합니다. 한도 초과 시 실행이 차단됩니다.</p>
          </div>
          <div className="divide-y divide-chat-border">
            {agents.map((agent) => {
              const existing = agentBudgets.find((b) => b.agentId === agent.id);
              const formState = agentBudgetForm[agent.id] ?? {
                limit: existing?.monthlyUsdLimit?.toString() ?? '',
                warn: existing?.warnAtPercent?.toString() ?? '80',
                block: existing?.blockAtLimit ?? false,
              };
              return (
                <div key={agent.id} className="px-4 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base">{agent.emoji}</span>
                    <span className="text-sm font-medium text-white">{agent.name}</span>
                    {existing && (
                      <span className="ml-auto text-xs text-emerald-400">
                        한도 ${existing.monthlyUsdLimit} / 경고 {existing.warnAtPercent}%
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      placeholder="월 한도 (USD)"
                      value={formState.limit}
                      onChange={(e) => setAgentBudgetForm((prev) => ({ ...prev, [agent.id]: { ...formState, limit: e.target.value } }))}
                      className="message-input w-32 text-xs"
                    />
                    <input
                      type="number"
                      min="0"
                      max="100"
                      placeholder="경고 % (기본 80)"
                      value={formState.warn}
                      onChange={(e) => setAgentBudgetForm((prev) => ({ ...prev, [agent.id]: { ...formState, warn: e.target.value } }))}
                      className="message-input w-32 text-xs"
                    />
                    <label className="flex items-center gap-1 text-xs text-sidebar-text cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formState.block}
                        onChange={(e) => setAgentBudgetForm((prev) => ({ ...prev, [agent.id]: { ...formState, block: e.target.checked } }))}
                      />
                      한도 시 차단
                    </label>
                    <button
                      onClick={() => {
                        const limit = parseFloat(formState.limit);
                        if (!Number.isFinite(limit) || limit <= 0) return;
                        setAgentBudget({ agentId: agent.id, monthlyUsdLimit: limit, warnAtPercent: parseFloat(formState.warn) || 80, blockAtLimit: formState.block });
                        setAgentBudgetsState(loadAgentBudgets());
                      }}
                      className="btn-primary text-xs px-3 py-1.5"
                    >
                      저장
                    </button>
                    {existing && (
                      <button
                        onClick={() => { removeAgentBudget(agent.id); setAgentBudgetsState(loadAgentBudgets()); }}
                        className="text-xs text-red-400 hover:text-red-300 px-2"
                      >
                        삭제
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
