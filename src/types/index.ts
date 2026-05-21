export type AgentTier = 'commander' | 'worker';
export type AgentStatus = 'idle' | 'working' | 'offline';

export interface Agent {
  id: string;
  name: string;
  role: string;
  tier: AgentTier;
  emoji: string;
  avatarUrl?: string;
  color: string;       // bg color class
  textColor: string;   // text color class
  status: AgentStatus;
  description: string;
  systemPrompt: string;
  canDelegate?: string[]; // agent ids this commander can delegate to
  model?: string;
  provider?: AIProviderId;
  isCustom?: boolean;
}

export type MessageRole = 'user' | 'agent' | 'system';

export interface ChatMessage {
  id: string;
  channelId: string;
  role: MessageRole;
  agentId?: string;
  content: string;
  timestamp: string;
  toolsUsed?: string[];
  delegatedTo?: string;
  isStreaming?: boolean;
}

export interface Channel {
  id: string;
  agentId: string;
  name: string;
  unreadCount: number;
  lastMessage?: string;
  lastMessageAt?: string;
}

export type ViewMode =
  | 'chat'
  | 'tasks'
  | 'budget'
  | 'issues'
  | 'audit'
  | 'settings'
  | 'orgchart'
  | 'vault'
  | 'pipeline'
  | 'webview'
  | 'usage'
  | 'toolmanager'
  | 'workflow'
  | 'team'
  | 'scheduler'
  | 'operations'
  | 'timeline';

// AI 프로바이더
export type AIProviderId =
  | 'claude'
  | 'gemini'
  | 'openai'
  | 'openrouter'
  | 'deepseek'
  | 'kimi'
  | 'minimax'
  | 'ollama';

export interface AIProviderConfig {
  id: AIProviderId;
  name: string;
  apiKey: string;
  isConnected: boolean;
  models: { id: string; label: string }[];
  selectedModel: string;
}

export interface ProviderUsageStat {
  messages: number;
  inputTokens: number;
  outputTokens: number;
  cost?: number;
}

export interface DailyUsage {
  date: string;
  providers: Partial<Record<AIProviderId, ProviderUsageStat>>;
}

export interface UsageStore {
  daily: DailyUsage[];
  session: Partial<Record<AIProviderId, ProviderUsageStat>>;
  sessionStarted: string;
}

// 파이프라인
export interface PipelineStep {
  agentId: string;
  instruction: string;
  dependsOnPrevious: boolean; // 이전 결과를 context로 전달
  approvalRequired?: boolean;
}

export interface PipelineRun {
  id: string;
  name: string;
  steps: PipelineStep[];
  status: 'idle' | 'running' | 'done' | 'error';
  currentStep: number;
  createdAt: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  goal: string;
  steps: PipelineStep[];
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledJob {
  id: string;
  title: string;
  type: 'message' | 'workflow';
  targetChannelId: string;
  prompt: string;
  workflowId?: string;
  runAt: string;
  repeat: 'none' | 'daily' | 'weekly';
  status: 'scheduled' | 'done' | 'paused';
  createdAt: string;
  lastRunAt?: string;
}

export interface WorkflowRunLog {
  id: string;
  workflowName: string;
  goal: string;
  status: 'running' | 'done' | 'blocked' | 'error';
  startedAt: string;
  finishedAt?: string;
  steps: {
    agentId: string;
    instruction: string;
    status: 'pending' | 'running' | 'done' | 'blocked' | 'error';
    output?: string;
    startedAt?: string;
    finishedAt?: string;
  }[];
}

export interface ApprovalRequest {
  id: string;
  title: string;
  description: string;
  source: 'workflow' | 'payment' | 'system';
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  decidedAt?: string;
}

export interface PaymentRequest {
  id: string;
  title: string;
  amount: number;
  vendor: string;
  description: string;
  status: 'pending' | 'approved' | 'paid' | 'rejected';
  createdAt: string;
}

export interface FolderTrigger {
  id: string;
  name: string;
  folderPath: string;
  prompt: string;
  workflowId?: string;
  enabled: boolean;
  knownEntries: string[];
  createdAt: string;
  lastCheckedAt?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'backlog' | 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
}

export interface BudgetEntry {
  id: string;
  category: string;
  amount: number;
  type: 'income' | 'expense';
  description: string;
  date: string;
  agentId?: string;
}

export interface Issue {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  severity: 'low' | 'medium' | 'high' | 'critical';
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  actor: string;
  description: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export type SubscriptionPlan = 'free' | 'pro' | 'team';

export interface SubscriptionInfo {
  plan: SubscriptionPlan;
  commanderSlots: number;
  workerSlots: number;
  messageLimit: number; // -1 = unlimited
  messagesUsed: number;
  expiresAt?: string;
}

// ── US-001: 에이전트별 예산 ──────────────────────────────────────────────────

export interface AgentBudget {
  agentId: string;
  monthlyUsdLimit: number;
  warnAtPercent: number;
  blockAtLimit: boolean;
}

// ── US-002: Atomic 작업 체크아웃 ─────────────────────────────────────────────

export interface TaskCheckout {
  taskId: string;
  agentId: string;
  lockedAt: string;
  expiresAt: string;
}

// ── US-003: 하트비트 엔진 ────────────────────────────────────────────────────

export interface HeartbeatEvent {
  timestamp: string;
  status: AgentStatus;
}

export interface HeartbeatState {
  agentId: string;
  lastHeartbeat: string;
  heartbeatCount: number;
  status: AgentStatus;
  history: HeartbeatEvent[];
}

// ── US-004: 실행 전 승인 게이트 ──────────────────────────────────────────────

export interface ApprovalGate {
  agentIds: string[];
  toolPatterns: string[];
  costThresholdUsd: number;
  enabled: boolean;
}

// ── US-005: 에이전트 설정 버전관리 ───────────────────────────────────────────

export interface AgentConfigSnapshot {
  systemPrompt?: string;
  model?: string;
  provider?: string;
  presetMode?: string;
  systemNote?: string;
}

export interface AgentConfigVersion {
  id: string;
  agentId: string;
  config: AgentConfigSnapshot;
  savedAt: string;
  label: string;
}
