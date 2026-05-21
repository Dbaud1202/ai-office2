import type { ApprovalRequest, FolderTrigger, PaymentRequest, Task, WorkflowRunLog, WorkflowTemplate } from '../types/index.js';

export const KEYS = {
  tasks: 'ao2-tasks',
  archive: 'ao2-message-archive-v1',
  workflows: 'ao2-workflows-v1',
  scheduledJobs: 'ao2-scheduled-jobs-v1',
  workflowLogs: 'ao2-workflow-run-logs-v1',
  approvals: 'ao2-approvals-v1',
  payments: 'ao2-payment-requests-v1',
  folderTriggers: 'ao2-folder-triggers-v1',
  discord: 'ao2-discord-config-v1',
  wallet: 'ao2-wallet-v1',
};

export interface DiscordConfig {
  webhookUrl: string;
  botToken: string;
  channelId: string;
  enabled: boolean;
  lastMessageId?: string;
}

export interface WalletState {
  balance: number;
  lowBalanceThreshold: number;
  currency: string;
  autoApproveLimit: number;
}

export interface MessageArchive {
  id: string;
  label: string;
  archivedAt: string;
  messages: unknown;
}

export function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function readJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '') as T;
  } catch {
    return fallback;
  }
}

export function writeJson<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function loadTasks() {
  return readJson<Task[]>(KEYS.tasks, []);
}

export function saveTasks(tasks: Task[]) {
  writeJson(KEYS.tasks, tasks);
}

export function loadWorkflowLogs() {
  return readJson<WorkflowRunLog[]>(KEYS.workflowLogs, []);
}

export function saveWorkflowLogs(logs: WorkflowRunLog[]) {
  writeJson(KEYS.workflowLogs, logs.slice(0, 100));
}

export function loadApprovals() {
  return readJson<ApprovalRequest[]>(KEYS.approvals, []);
}

export function saveApprovals(items: ApprovalRequest[]) {
  writeJson(KEYS.approvals, items);
}

export function createApproval(input: Omit<ApprovalRequest, 'id' | 'status' | 'createdAt'>) {
  const item: ApprovalRequest = { ...input, id: makeId(), status: 'pending', createdAt: new Date().toISOString() };
  saveApprovals([item, ...loadApprovals()]);
  return item;
}

export function loadPayments() {
  return readJson<PaymentRequest[]>(KEYS.payments, []);
}

export function savePayments(items: PaymentRequest[]) {
  writeJson(KEYS.payments, items);
}

export function loadFolderTriggers() {
  return readJson<FolderTrigger[]>(KEYS.folderTriggers, []);
}

export function saveFolderTriggers(items: FolderTrigger[]) {
  writeJson(KEYS.folderTriggers, items);
}

export function loadDiscordConfig() {
  return readJson<DiscordConfig>(KEYS.discord, { webhookUrl: '', botToken: '', channelId: '', enabled: false });
}

export function saveDiscordConfig(config: DiscordConfig) {
  writeJson(KEYS.discord, config);
}

export function loadWallet() {
  return readJson<WalletState>(KEYS.wallet, {
    balance: 0,
    lowBalanceThreshold: 10000,
    currency: 'KRW',
    autoApproveLimit: 0,
  });
}

export function saveWallet(wallet: WalletState) {
  writeJson(KEYS.wallet, wallet);
}

export function loadArchives() {
  return readJson<MessageArchive[]>(KEYS.archive, []);
}

export function loadWorkflows() {
  return readJson<WorkflowTemplate[]>(KEYS.workflows, []);
}

export async function notifyDiscord(content: string) {
  const config = loadDiscordConfig();
  const api = typeof window !== 'undefined' ? (window as any).electronAPI : null;
  if (!config.enabled || !config.webhookUrl || !api?.discordWebhookSend) return false;
  const result = await api.discordWebhookSend({ webhookUrl: config.webhookUrl, content });
  return Boolean(result?.ok);
}
