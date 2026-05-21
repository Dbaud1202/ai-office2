import type { ApprovalGate } from '../types/index.js';
import { createApproval } from './opsStore.js';

export const STORAGE_KEY = 'ao2-approval-gate-v1';

const DEFAULT_GATE: ApprovalGate = {
  agentIds: [],
  toolPatterns: [],
  costThresholdUsd: 0.5,
  enabled: false,
};

export function loadApprovalGate(): ApprovalGate {
  try {
    return { ...DEFAULT_GATE, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') };
  } catch {
    return DEFAULT_GATE;
  }
}

export function saveApprovalGate(gate: ApprovalGate): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(gate));
}

export function requiresApproval(
  agentId: string,
  toolName: string,
  estimatedCostUsd: number
): boolean {
  const gate = loadApprovalGate();
  if (!gate.enabled) return false;

  const agentMatches = gate.agentIds.length === 0 || gate.agentIds.includes(agentId);
  const toolMatches =
    gate.toolPatterns.length === 0 ||
    gate.toolPatterns.some((pattern) => {
      try {
        return new RegExp(pattern).test(toolName);
      } catch {
        return toolName.includes(pattern);
      }
    });
  const costMatches = gate.costThresholdUsd > 0 && estimatedCostUsd >= gate.costThresholdUsd;

  return agentMatches && (toolMatches || costMatches);
}

export function createGatedApproval(
  agentId: string,
  toolName: string,
  estimatedCostUsd: number
): void {
  createApproval({
    title: `실행 승인 필요: ${agentId} → ${toolName}`,
    description: `에이전트: ${agentId}\n도구: ${toolName}\n예상 비용: $${estimatedCostUsd.toFixed(4)}\n\n승인 게이트 규칙에 따라 실행 전 승인이 필요합니다.`,
    source: 'system',
  });
}
