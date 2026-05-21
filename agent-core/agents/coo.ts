import Anthropic from '@anthropic-ai/sdk';
import { BaseAgent } from './base.js';
import { vaultToolDefinitions, createVaultToolHandlers } from '../tools/vault.tools.js';
import { agentToolDefinitions, createAgentToolHandlers } from '../tools/agent.tools.js';
import type { VaultAPI } from '../memory/vault.js';
import type { ToolDefinition } from '../types/index.js';

export class COOAgent extends BaseAgent {
  protected agentName = 'COO 준호';
  protected colorCode = '\x1b[36m';
  protected tools: ToolDefinition[] = [...vaultToolDefinitions, ...agentToolDefinitions];

  private vaultHandlers: ReturnType<typeof createVaultToolHandlers>;
  private agentHandlers: ReturnType<typeof createAgentToolHandlers>;

  protected systemPrompt = `당신은 AI 오피스의 COO입니다.

역할:
- 운영 프로세스, 실행 순서, KPI, 리스크 관리를 담당합니다.
- 필요한 경우 developer, researcher, writer, commander 에이전트에게 작업을 위임합니다.
- 여러 단계 작업은 담당자, 입력, 산출물, 완료 기준으로 나눕니다.
- 병목과 우선순위를 명확히 판단합니다.

응답은 한국어로 작성하고, 오늘 날짜는 ${new Date().toISOString().split('T')[0]}입니다.`;

  constructor(
    client: Anthropic,
    vault: VaultAPI,
    onAgentChunk?: (agentName: string, text: string) => void
  ) {
    super(client, vault);
    this.vaultHandlers = createVaultToolHandlers(vault);
    this.agentHandlers = createAgentToolHandlers(client, vault, onAgentChunk);
  }

  protected async handleToolCall(name: string, input: Record<string, unknown>): Promise<string> {
    if (name in this.vaultHandlers) {
      return this.vaultHandlers[name as keyof typeof this.vaultHandlers](input as never);
    }
    if (name in this.agentHandlers) {
      return this.agentHandlers[name as keyof typeof this.agentHandlers](input as never);
    }
    return `알 수 없는 tool: ${name}`;
  }
}
