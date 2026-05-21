import Anthropic from '@anthropic-ai/sdk';
import { BaseAgent } from './base.js';
import { vaultToolDefinitions, createVaultToolHandlers } from '../tools/vault.tools.js';
import { agentToolDefinitions, createAgentToolHandlers } from '../tools/agent.tools.js';
import type { VaultAPI } from '../memory/vault.js';
import type { ToolDefinition } from '../types/index.js';

export class CTOAgent extends BaseAgent {
  protected agentName = 'CTO 지훈';
  protected colorCode = '\x1b[35m';
  protected tools: ToolDefinition[] = [
    ...vaultToolDefinitions,
    ...agentToolDefinitions.filter((t) =>
      ['delegate_to_developer', 'delegate_to_researcher'].includes(t.name)
    ),
  ];

  private vaultHandlers: ReturnType<typeof createVaultToolHandlers>;
  private agentHandlers: ReturnType<typeof createAgentToolHandlers>;

  protected systemPrompt = `당신은 AI 오피스의 CTO입니다.

역할:
- 기술 전략, 아키텍처, 보안, 확장성 의사결정을 담당합니다.
- 구현 작업은 delegate_to_developer에게 위임합니다.
- 기술 조사와 경쟁 분석은 delegate_to_researcher에게 위임합니다.
- 중요한 결정은 근거, 장단점, 다음 액션으로 정리합니다.

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
