export type AgentRole = 'pm' | 'researcher' | 'developer' | 'writer';
export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'failed';

export interface Task {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  description: string;
  assignedTo: AgentRole;
  requestedBy: AgentRole | 'user';
  status: TaskStatus;
  result?: string;
  vaultPath?: string;
  parentTaskId?: string;
  tags: string[];
}

export interface VaultNote {
  path: string;
  title: string;
  content: string;
  frontmatter: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  tags: string[];
}

export interface VaultSearchResult {
  note: VaultNote;
  score: number;
  snippet: string;
}

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  agentId?: AgentRole;
  timestamp: string;
}

export interface Session {
  id: string;
  startedAt: string;
  history: ConversationTurn[];
  activeTasks: Task[];
}

export interface DelegationRequest {
  targetAgent: AgentRole;
  taskTitle: string;
  instruction: string;
  context?: string;
  saveToVault?: string;
}

export interface DelegationResult {
  agentId: AgentRole;
  taskId: string;
  output: string;
  vaultPath?: string;
  success: boolean;
  error?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
}

export interface AgentRunResult {
  output: string;
  vaultPath?: string;
  toolsUsed: string[];
}
