import React, { useMemo, useState } from 'react';
import { classifyHarnessTask, buildHarnessRunBrief } from '../../harness/router.js';
import { HARNESS_CONNECTORS, recommendHarnessConnectors } from '../../harness/connectors.js';
import { loadHarnessReflections, summarizeHarnessStats } from '../../harness/reflection.js';

const SAMPLE_PROMPTS = [
  '간단히 오늘 우선순위만 정리해줘',
  'MCP 연결까지 포함해서 GitHub 이슈를 자동 처리하는 워크플로를 만들어줘',
  '보안 위험을 검토하고 필요한 팀 토론 후 배포 가능한 계획으로 정리해줘',
];

export default function HarnessDashboard() {
  const [prompt, setPrompt] = useState(SAMPLE_PROMPTS[1]);
  const [refreshKey, setRefreshKey] = useState(0);
  const decision = useMemo(() => classifyHarnessTask(prompt), [prompt]);
  const connectors = useMemo(() => recommendHarnessConnectors(prompt), [prompt]);
  const reflections = useMemo(() => loadHarnessReflections(), [refreshKey]);
  const stats = useMemo(() => summarizeHarnessStats(reflections), [reflections]);

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <header className="drag-region h-10 flex items-center gap-3 px-5 border-b border-chat-border flex-shrink-0">
        <span className="no-drag text-sm font-semibold text-white">Harness</span>
        <span className="no-drag text-xs text-sidebar-muted">routing, connectors, reflection</span>
        <button onClick={() => setRefreshKey((value) => value + 1)} className="no-drag btn-ghost ml-auto">
          Refresh
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="mx-auto grid max-w-6xl gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="space-y-4">
            <div className="panel-card space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-white">Task router</h2>
                  <p className="text-xs text-sidebar-muted">The app decides fast/direct/workroom/debate before spending model calls.</p>
                </div>
                <span className="rounded bg-brand-primary/20 px-2 py-1 text-xs text-blue-300">
                  {decision.route}
                </span>
              </div>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={5}
                className="message-input"
                placeholder="Paste a task to preview the harness decision."
              />
              <div className="grid gap-2 md:grid-cols-4">
                <Metric label="Difficulty" value={decision.difficulty} />
                <Metric label="Confidence" value={`${Math.round(decision.confidence * 100)}%`} />
                <Metric label="Rounds" value={String(decision.maxRounds)} />
                <Metric label="Reflection" value={decision.needsReflection ? 'on' : 'off'} />
              </div>
              <pre className="max-h-52 overflow-auto rounded border border-chat-border bg-[#1a1d21] p-3 text-xs leading-relaxed text-sidebar-text whitespace-pre-wrap">
                {buildHarnessRunBrief(decision)}
              </pre>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="panel-card">
                <h2 className="text-sm font-semibold text-white">Connector match</h2>
                <div className="mt-3 space-y-2">
                  {connectors.map((connector) => (
                    <div key={connector.id} className="rounded border border-chat-border bg-[#1a1d21] p-3">
                      <div className="flex items-center gap-2">
                        <p className="flex-1 text-sm font-semibold text-white">{connector.name}</p>
                        <span className="rounded bg-sidebar-hover px-2 py-0.5 text-[11px] text-sidebar-text">{connector.kind}</span>
                        <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">{connector.status}</span>
                      </div>
                      <p className="mt-1 text-xs text-sidebar-muted">{connector.description}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="panel-card">
                <h2 className="text-sm font-semibold text-white">Connector catalog</h2>
                <div className="mt-3 space-y-2">
                  {HARNESS_CONNECTORS.map((connector) => (
                    <div key={connector.id} className="flex items-center gap-2 rounded bg-[#1a1d21] px-3 py-2">
                      <span className="text-xs text-sidebar-muted">{connector.kind}</span>
                      <span className="flex-1 truncate text-sm text-sidebar-text">{connector.name}</span>
                      <span className="text-xs text-sidebar-muted">{connector.status}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </section>

          <aside className="space-y-4">
            <section className="panel-card">
              <h2 className="text-sm font-semibold text-white">Self-reflection</h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Metric label="Runs" value={String(stats.totalRuns)} />
                <Metric label="Avg score" value={String(stats.averageScore)} />
              </div>
              <div className="mt-4 space-y-2">
                {stats.recentLessons.length === 0 ? (
                  <p className="text-xs text-sidebar-muted">No reflected runs yet. Use chat once to seed the loop.</p>
                ) : (
                  stats.recentLessons.map((lesson) => (
                    <p key={lesson} className="rounded bg-[#1a1d21] p-2 text-xs leading-relaxed text-sidebar-text">{lesson}</p>
                  ))
                )}
              </div>
            </section>

            <section className="panel-card">
              <h2 className="text-sm font-semibold text-white">Recent runs</h2>
              <div className="mt-3 space-y-2">
                {reflections.slice(0, 8).map((item) => (
                  <div key={item.id} className="rounded border border-chat-border bg-[#1a1d21] p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-blue-300">{item.route}</span>
                      <span className="text-xs text-sidebar-muted">{item.difficulty}</span>
                      <span className="ml-auto text-xs text-emerald-300">{item.score}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-sidebar-text">{item.prompt}</p>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-chat-border bg-[#1a1d21] px-3 py-2">
      <p className="text-[11px] uppercase text-sidebar-muted">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
