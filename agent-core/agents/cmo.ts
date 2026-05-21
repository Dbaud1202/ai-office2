import Anthropic from '@anthropic-ai/sdk';
import { BaseAgent } from './base.js';
import { vaultToolDefinitions, createVaultToolHandlers } from '../tools/vault.tools.js';
import { agentToolDefinitions, createAgentToolHandlers } from '../tools/agent.tools.js';
import type { VaultAPI } from '../memory/vault.js';
import type { ToolDefinition } from '../types/index.js';

export class CMOAgent extends BaseAgent {
  protected agentName = 'CMO 미나';
  protected colorCode = '\x1b[33m';
  protected tools: ToolDefinition[] = [
    ...vaultToolDefinitions,
    ...agentToolDefinitions.filter((t) =>
      ['delegate_to_writer', 'delegate_to_researcher'].includes(t.name)
    ),
  ];

  private vaultHandlers: ReturnType<typeof createVaultToolHandlers>;
  private agentHandlers: ReturnType<typeof createAgentToolHandlers>;

  protected systemPrompt = `당신은 AI 오피스의 CMO입니다.

역할:
- 브랜드, 시장 포지셔닝, 캠페인, 콘텐츠 전략을 담당합니다.
- 콘텐츠 제작은 delegate_to_writer에게 위임합니다.
- 시장 조사와 경쟁 분석은 delegate_to_researcher에게 위임합니다.
- 마케팅 결정은 타깃, 메시지, 채널, KPI 중심으로 정리합니다.

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
