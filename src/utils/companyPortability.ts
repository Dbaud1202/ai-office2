import { loadAgentBudgets, STORAGE_KEY as AGENT_BUDGETS_KEY } from './agentBudgetStore.js';
import { loadApprovalGate, STORAGE_KEY as APPROVAL_GATE_KEY } from './approvalGateStore.js';
import { readJson, writeJson, KEYS, loadWorkflows } from './opsStore.js';
import type { ScheduledJob, WorkflowTemplate } from '../types/index.js';
import type { AgentBudget, ApprovalGate } from '../types/index.js';

const SENSITIVE_FIELDS = ['apiKey', 'webhookUrl', 'botToken', 'accessToken', 'secret'];

function redactSensitive(obj: unknown): unknown {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(redactSensitive);

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_FIELDS.some((f) => key.toLowerCase().includes(f.toLowerCase()))) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = redactSensitive(value);
    }
  }
  return result;
}

export interface CompanyExport {
  exportedAt: string;
  version: '1.0';
  workflows: WorkflowTemplate[];
  scheduledJobs: ScheduledJob[];
  agentBudgets: AgentBudget[];
  approvalGate: ApprovalGate;
}

export function exportCompany(): string {
  const data: CompanyExport = {
    exportedAt: new Date().toISOString(),
    version: '1.0',
    workflows: loadWorkflows(),
    scheduledJobs: readJson<ScheduledJob[]>(KEYS.scheduledJobs, []),
    agentBudgets: loadAgentBudgets(),
    approvalGate: loadApprovalGate(),
  };

  return JSON.stringify(redactSensitive(data), null, 2);
}

export interface ImportResult {
  ok: boolean;
  workflowCount: number;
  jobCount: number;
  budgetCount: number;
  errors: string[];
}

export function importCompany(jsonStr: string): ImportResult {
  const errors: string[] = [];
  let workflowCount = 0;
  let jobCount = 0;
  let budgetCount = 0;

  try {
    const data = JSON.parse(jsonStr) as Partial<CompanyExport>;

    if (Array.isArray(data.workflows) && data.workflows.length > 0) {
      writeJson(KEYS.workflows, data.workflows);
      workflowCount = data.workflows.length;
    }

    if (Array.isArray(data.scheduledJobs) && data.scheduledJobs.length > 0) {
      writeJson(KEYS.scheduledJobs, data.scheduledJobs);
      jobCount = data.scheduledJobs.length;
    }

    if (Array.isArray(data.agentBudgets) && data.agentBudgets.length > 0) {
      localStorage.setItem(AGENT_BUDGETS_KEY, JSON.stringify(data.agentBudgets));
      budgetCount = data.agentBudgets.length;
    }

    if (data.approvalGate && typeof data.approvalGate === 'object') {
      localStorage.setItem(APPROVAL_GATE_KEY, JSON.stringify(data.approvalGate));
    }
  } catch (e) {
    errors.push(`JSON 파싱 오류: ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, workflowCount, jobCount, budgetCount, errors };
  }

  return { ok: true, workflowCount, jobCount, budgetCount, errors };
}

export function downloadJson(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
