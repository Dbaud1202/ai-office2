import React, { useMemo, useState } from 'react';
import { ALL_CHANNEL_ID, useChat } from '../../contexts/ChatContext.js';
import type { ApprovalRequest, FolderTrigger, PaymentRequest, Task, WorkflowTemplate } from '../../types/index.js';
import {
  createApproval,
  KEYS,
  loadApprovals,
  loadArchives,
  loadDiscordConfig,
  loadFolderTriggers,
  loadPayments,
  loadTasks,
  loadWallet,
  loadWorkflowLogs,
  loadWorkflows,
  makeId,
  notifyDiscord,
  saveApprovals,
  saveDiscordConfig,
  saveFolderTriggers,
  savePayments,
  saveTasks,
  saveWallet,
  writeJson,
} from '../../utils/opsStore.js';

const TEMPLATES: { name: string; goal: string; prompt: string }[] = [
  { name: '매일 아침 브리핑', goal: '오늘 해야 할 일과 리스크를 CEO가 정리', prompt: '오늘의 일정, 할일, 리스크, 우선순위를 브리핑해줘.' },
  { name: '주간 회고', goal: '이번 주 성과와 다음 주 계획 정리', prompt: '이번 주 성과, 병목, 다음 주 우선순위를 정리해줘.' },
  { name: '다운로드 폴더 정리', goal: '다운로드 폴더 파일 분류 계획', prompt: '다운로드 폴더를 분석해서 정리 계획을 세워줘. 위험한 삭제는 승인 대기로 남겨.' },
  { name: '시장 뉴스 요약', goal: '시장/경쟁사 동향 요약', prompt: '우리 일과 관련된 시장 동향과 경쟁사 변화를 요약해줘.' },
];

function now() {
  return new Date().toISOString();
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency }).format(value || 0);
}

export default function OperationsCenter() {
  const { sendMessage, runPipeline } = useChat();
  const [tab, setTab] = useState<'todo' | 'money' | 'discord' | 'archive' | 'logs' | 'triggers' | 'approvals' | 'templates'>('todo');
  const [version, setVersion] = useState(0);
  const tasks = useMemo(() => loadTasks(), [version]);
  const wallet = useMemo(() => loadWallet(), [version]);
  const payments = useMemo(() => loadPayments(), [version]);
  const discord = useMemo(() => loadDiscordConfig(), [version]);
  const archives = useMemo(() => loadArchives(), [version]);
  const logs = useMemo(() => loadWorkflowLogs(), [version]);
  const triggers = useMemo(() => loadFolderTriggers(), [version]);
  const approvals = useMemo(() => loadApprovals(), [version]);
  const workflows = useMemo(() => loadWorkflows(), [version]);
  const [todoTitle, setTodoTitle] = useState('');
  const [paymentForm, setPaymentForm] = useState({ title: '', vendor: '', amount: '', description: '' });
  const [discordForm, setDiscordForm] = useState(discord);
  const [triggerForm, setTriggerForm] = useState({ name: '', folderPath: '', prompt: '', workflowId: '' });

  function refresh() {
    setVersion((value) => value + 1);
  }

  function addTodo() {
    if (!todoTitle.trim()) return;
    const task: Task = {
      id: makeId(),
      title: todoTitle.trim(),
      description: '운영 센터에서 남긴 할일',
      status: 'todo',
      priority: 'medium',
      createdAt: now(),
      updatedAt: now(),
      tags: ['inbox'],
    };
    saveTasks([task, ...tasks]);
    setTodoTitle('');
    refresh();
  }

  async function addPayment() {
    const amount = Number(paymentForm.amount);
    if (!paymentForm.title.trim() || !Number.isFinite(amount) || amount <= 0) return;
    const item: PaymentRequest = {
      id: makeId(),
      title: paymentForm.title.trim(),
      vendor: paymentForm.vendor.trim() || '미지정',
      amount,
      description: paymentForm.description.trim(),
      status: amount <= wallet.autoApproveLimit ? 'approved' : 'pending',
      createdAt: now(),
    };
    savePayments([item, ...payments]);
    if (item.status === 'pending') {
      createApproval({ title: `결제 승인: ${item.title}`, description: `${item.vendor} / ${money(item.amount, wallet.currency)}`, source: 'payment' });
    }
    if (wallet.balance - amount < wallet.lowBalanceThreshold) {
      await notifyDiscord(`💸 잔액 부족 경고: 결제 요청 ${item.title} 이후 잔액이 기준 아래로 내려갈 수 있습니다.`);
    }
    setPaymentForm({ title: '', vendor: '', amount: '', description: '' });
    refresh();
  }

  function decideApproval(item: ApprovalRequest, status: 'approved' | 'rejected') {
    saveApprovals(approvals.map((approval) => approval.id === item.id ? { ...approval, status, decidedAt: now() } : approval));
    refresh();
  }

  async function testDiscord() {
    saveDiscordConfig(discordForm);
    await notifyDiscord('✅ AI오피스2 디스코드 연결 테스트');
    refresh();
  }

  async function fetchDiscordCommands() {
    const api = (window as any).electronAPI;
    saveDiscordConfig(discordForm);
    if (!api?.discordFetchMessages || !discordForm.botToken || !discordForm.channelId) return;
    const result = await api.discordFetchMessages({ botToken: discordForm.botToken, channelId: discordForm.channelId, limit: 20, after: discordForm.lastMessageId });
    if (!result?.ok || !Array.isArray(result.data)) return;
    const messages = result.data.slice().reverse();
    let lastId = discordForm.lastMessageId;
    for (const message of messages) {
      lastId = message.id;
      const content = String(message.content ?? '').trim();
      if (!content.startsWith('!ao')) continue;
      const command = content.replace(/^!ao\s*/, '');
      if (command.startsWith('상태') || command.startsWith('status')) {
        await notifyDiscord(`📊 상태: 할일 ${tasks.filter((t) => t.status !== 'done').length}개, 승인 대기 ${approvals.filter((a) => a.status === 'pending').length}개, 결제 요청 ${payments.filter((p) => p.status === 'pending').length}개`);
      } else if (command.startsWith('할일 ')) {
        const title = command.replace(/^할일\s*/, '');
        saveTasks([{ id: makeId(), title, description: 'Discord 명령으로 추가됨', status: 'todo', priority: 'medium', createdAt: now(), updatedAt: now(), tags: ['discord'] }, ...loadTasks()]);
        await notifyDiscord(`✅ 할일 추가: ${title}`);
      } else if (command.startsWith('명령 ')) {
        const prompt = command.replace(/^명령\s*/, '');
        await sendMessage(ALL_CHANNEL_ID, prompt);
        await notifyDiscord(`👑 CEO 회의실로 전달: ${prompt.slice(0, 80)}`);
      }
    }
    saveDiscordConfig({ ...discordForm, lastMessageId: lastId, enabled: discordForm.enabled });
    refresh();
  }

  function addTrigger() {
    if (!triggerForm.name.trim() || !triggerForm.folderPath.trim()) return;
    const trigger: FolderTrigger = {
      id: makeId(),
      name: triggerForm.name.trim(),
      folderPath: triggerForm.folderPath.trim(),
      prompt: triggerForm.prompt.trim() || '새 파일을 검토하고 필요한 작업을 정리해줘.',
      workflowId: triggerForm.workflowId || undefined,
      enabled: true,
      knownEntries: [],
      createdAt: now(),
    };
    saveFolderTriggers([trigger, ...triggers]);
    setTriggerForm({ name: '', folderPath: '', prompt: '', workflowId: '' });
    refresh();
  }

  function installTemplate(template: typeof TEMPLATES[number]) {
    const existing = loadWorkflows();
    const workflow: WorkflowTemplate = {
      id: makeId(),
      name: template.name,
      description: '반복 업무 템플릿',
      goal: template.goal,
      steps: [
        { agentId: 'ceo', instruction: template.prompt, dependsOnPrevious: false },
        { agentId: 'coo', instruction: '실행 순서와 담당자를 정리하세요.', dependsOnPrevious: true },
        { agentId: 'ceo', instruction: '최종 액션을 확정하세요.', dependsOnPrevious: true, approvalRequired: template.name.includes('정리') },
      ],
      createdAt: now(),
      updatedAt: now(),
    };
    writeJson(KEYS.workflows, [workflow, ...existing]);
    refresh();
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <header className="drag-region h-10 flex items-center gap-3 px-5 border-b border-chat-border flex-shrink-0">
        <span className="no-drag text-sm font-semibold text-white">🕹️ 운영 센터</span>
        <button onClick={refresh} className="no-drag btn-ghost ml-auto">새로고침</button>
      </header>

      <div className="flex border-b border-chat-border px-4">
        {[
          ['todo', '할일'],
          ['money', '돈/결제'],
          ['discord', 'Discord'],
          ['archive', '대화 아카이브'],
          ['logs', '실행 로그'],
          ['triggers', '폴더 트리거'],
          ['approvals', '승인 대기'],
          ['templates', '템플릿'],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id as any)} className={`px-3 py-2 text-sm ${tab === id ? 'text-white border-b-2 border-brand-primary' : 'text-sidebar-muted'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {tab === 'todo' && (
          <section className="mx-auto max-w-4xl space-y-3">
            <div className="panel-card flex gap-2">
              <input value={todoTitle} onChange={(e) => setTodoTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTodo()} placeholder="나중에 처리할 일을 남겨두기" className="message-input" />
              <button onClick={addTodo} className="btn-primary">추가</button>
            </div>
            {tasks.filter((task) => task.status !== 'done').map((task) => <div key={task.id} className="panel-card"><p className="text-sm font-semibold text-white">{task.title}</p><p className="text-xs text-sidebar-muted">{task.description}</p></div>)}
          </section>
        )}

        {tab === 'money' && (
          <section className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[320px_1fr]">
            <div className="panel-card space-y-3">
              <h2 className="text-sm font-semibold text-white">운영 자금</h2>
              <input type="number" value={wallet.balance} onChange={(e) => { saveWallet({ ...wallet, balance: Number(e.target.value) }); refresh(); }} className="message-input" />
              <input type="number" value={wallet.lowBalanceThreshold} onChange={(e) => { saveWallet({ ...wallet, lowBalanceThreshold: Number(e.target.value) }); refresh(); }} className="message-input" />
              <input type="number" value={wallet.autoApproveLimit} onChange={(e) => { saveWallet({ ...wallet, autoApproveLimit: Number(e.target.value) }); refresh(); }} className="message-input" />
              <p className="text-xs text-sidebar-muted">잔액 {money(wallet.balance, wallet.currency)} · 자동승인 한도 {money(wallet.autoApproveLimit, wallet.currency)}</p>
            </div>
            <div className="space-y-3">
              <div className="panel-card grid gap-2">
                <input value={paymentForm.title} onChange={(e) => setPaymentForm({ ...paymentForm, title: e.target.value })} placeholder="결제 항목" className="message-input" />
                <input value={paymentForm.vendor} onChange={(e) => setPaymentForm({ ...paymentForm, vendor: e.target.value })} placeholder="업체/서비스" className="message-input" />
                <input type="number" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} placeholder="금액" className="message-input" />
                <textarea value={paymentForm.description} onChange={(e) => setPaymentForm({ ...paymentForm, description: e.target.value })} placeholder="설명" className="message-input" />
                <button onClick={addPayment} className="btn-primary">결제 요청 생성</button>
              </div>
              {payments.map((payment) => <div key={payment.id} className="panel-card"><p className="text-sm font-semibold text-white">{payment.title} · {money(payment.amount, wallet.currency)}</p><p className="text-xs text-sidebar-muted">{payment.vendor} · {payment.status}</p></div>)}
            </div>
          </section>
        )}

        {tab === 'discord' && (
          <section className="mx-auto max-w-3xl panel-card space-y-3">
            <input value={discordForm.webhookUrl} onChange={(e) => setDiscordForm({ ...discordForm, webhookUrl: e.target.value })} placeholder="Discord Webhook URL" className="message-input" />
            <input value={discordForm.botToken} onChange={(e) => setDiscordForm({ ...discordForm, botToken: e.target.value })} placeholder="Bot Token (!ao 명령 수신용)" className="message-input" />
            <input value={discordForm.channelId} onChange={(e) => setDiscordForm({ ...discordForm, channelId: e.target.value })} placeholder="Channel ID" className="message-input" />
            <label className="flex items-center gap-2 text-sm text-sidebar-text"><input type="checkbox" checked={discordForm.enabled} onChange={(e) => setDiscordForm({ ...discordForm, enabled: e.target.checked })} /> Discord 알림 사용</label>
            <div className="flex gap-2"><button onClick={testDiscord} className="btn-primary">저장/테스트</button><button onClick={fetchDiscordCommands} className="btn-ghost">명령 가져오기</button></div>
            <p className="text-xs text-sidebar-muted">명령 예: !ao 상태, !ao 할일 세금계산서 확인, !ao 명령 오늘 우선순위 회의해줘</p>
          </section>
        )}

        {tab === 'archive' && <section className="mx-auto max-w-5xl space-y-3">{archives.map((item) => <details key={item.id} className="panel-card"><summary className="cursor-pointer text-sm text-white">{item.label} · {new Date(item.archivedAt).toLocaleString('ko-KR')}</summary><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-xs text-sidebar-text">{JSON.stringify(item.messages, null, 2)}</pre></details>)}</section>}

        {tab === 'logs' && <section className="mx-auto max-w-5xl space-y-3">{logs.map((log) => <div key={log.id} className="panel-card"><p className="text-sm font-semibold text-white">{log.workflowName} · {log.status}</p><p className="text-xs text-sidebar-muted">{new Date(log.startedAt).toLocaleString('ko-KR')}</p><div className="mt-3 space-y-2">{log.steps.map((step, idx) => <div key={idx} className="rounded bg-[#1a1d21] p-2 text-xs text-sidebar-text">{idx + 1}. {step.agentId} · {step.status}</div>)}</div></div>)}</section>}

        {tab === 'triggers' && (
          <section className="mx-auto max-w-4xl space-y-3">
            <div className="panel-card grid gap-2">
              <input value={triggerForm.name} onChange={(e) => setTriggerForm({ ...triggerForm, name: e.target.value })} placeholder="트리거 이름" className="message-input" />
              <input value={triggerForm.folderPath} onChange={(e) => setTriggerForm({ ...triggerForm, folderPath: e.target.value })} placeholder="감시할 폴더 절대경로" className="message-input" />
              <select value={triggerForm.workflowId} onChange={(e) => setTriggerForm({ ...triggerForm, workflowId: e.target.value })} className="message-input"><option value="">CEO 메시지로 실행</option>{workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}</select>
              <textarea value={triggerForm.prompt} onChange={(e) => setTriggerForm({ ...triggerForm, prompt: e.target.value })} placeholder="새 파일 발견 시 지시" className="message-input" />
              <button onClick={addTrigger} className="btn-primary">트리거 추가</button>
            </div>
            {triggers.map((trigger) => <div key={trigger.id} className="panel-card"><p className="text-sm font-semibold text-white">{trigger.name}</p><p className="text-xs text-sidebar-muted">{trigger.folderPath} · {trigger.enabled ? '활성' : '비활성'}</p></div>)}
          </section>
        )}

        {tab === 'approvals' && <section className="mx-auto max-w-4xl space-y-3">{approvals.map((approval) => <div key={approval.id} className="panel-card"><p className="text-sm font-semibold text-white">{approval.title}</p><p className="mt-1 whitespace-pre-wrap text-xs text-sidebar-muted">{approval.description}</p><div className="mt-3 flex gap-2"><button onClick={() => decideApproval(approval, 'approved')} className="btn-primary">승인</button><button onClick={() => decideApproval(approval, 'rejected')} className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-300">거절</button><span className="text-xs text-sidebar-muted">{approval.status}</span></div></div>)}</section>}

        {tab === 'templates' && <section className="mx-auto grid max-w-5xl gap-3 md:grid-cols-2">{TEMPLATES.map((template) => <div key={template.name} className="panel-card"><h3 className="text-sm font-semibold text-white">{template.name}</h3><p className="mt-2 text-xs text-sidebar-muted">{template.goal}</p><button onClick={() => installTemplate(template)} className="btn-primary mt-4">워크플로우로 추가</button></div>)}</section>}
      </div>
    </div>
  );
}
