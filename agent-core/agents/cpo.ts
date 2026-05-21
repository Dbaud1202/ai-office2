import Anthropic from '@anthropic-ai/sdk';
import { BaseAgent } from './base.js';
import { vaultToolDefinitions, createVaultToolHandlers } from '../tools/vault.tools.js';
import { agentToolDefinitions, createAgentToolHandlers } from '../tools/agent.tools.js';
import type { VaultAPI } from '../memory/vault.js';
import type { ToolDefinition } from '../types/index.js';

export class CPOAgent extends BaseAgent {
  protected agentName = 'CPO 루나';
  protected colorCode = '\x1b[94m';
  protected tools: ToolDefinition[] = [
    ...vaultToolDefinitions,
    ...agentToolDefinitions.filter((t) =>
      ['delegate_to_developer', 'delegate_to_researcher', 'delegate_to_writer'].includes(t.name)
    ),
  ];

  private vaultHandlers: ReturnType<typeof createVaultToolHandlers>;
  private agentHandlers: ReturnType<typeof createAgentToolHandlers>;

  protected systemPrompt = `당신은 AI 오피스의 CPO입니다.

역할:
- 제품 비전, 로드맵, PRD, 우선순위 결정을 담당합니다.
- 구현은 delegate_to_developer, 리서치는 delegate_to_researcher, 문서는 delegate_to_writer에게 위임합니다.
- 제품 결정은 사용자 가치, 영향도, 비용, 검증 지표 중심으로 정리합니다.

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
