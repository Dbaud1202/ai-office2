import Anthropic from '@anthropic-ai/sdk';
import type { ToolDefinition, AgentRunResult } from '../types/index.js';
import type { VaultAPI } from '../memory/vault.js';

const MODEL = 'claude-sonnet-4-6';
const MAX_ITERATIONS = 10;
const MEMORY_INJECT_COUNT = 3; // 자동 주입할 관련 기억 수

export abstract class BaseAgent {
  protected client: Anthropic;
  protected vault?: VaultAPI;
  protected abstract systemPrompt: string;
  protected abstract tools: ToolDefinition[];
  protected abstract agentName: string;

  // 색상 출력용 chalk 색상 코드 (각 에이전트가 override)
  protected abstract colorCode: string;

  constructor(client: Anthropic, vault?: VaultAPI) {
    this.client = client;
    this.vault = vault;
  }

  /**
   * 관련 vault 기억을 검색하여 컨텍스트 앞에 주입
   */
  private async buildContextWithMemory(
    instruction: string,
    context?: string
  ): Promise<string> {
    let memorySection = '';

    if (this.vault) {
      try {
        const results = await this.vault.searchNotes(instruction);
        const topResults = results.slice(0, MEMORY_INJECT_COUNT);

        if (topResults.length > 0) {
          const memories = topResults
            .map((r) => `### ${r.note.title}\n${r.snippet}`)
            .join('\n\n');
          memorySection = `## 관련 기억 (Vault)\n${memories}\n\n`;
        }
      } catch {
        // vault 검색 실패 시 조용히 스킵
      }
    }

    const contextSection = context ? `## 대화 이력\n${context}\n\n` : '';
    return `${memorySection}${contextSection}`;
  }

  async run(
    instruction: string,
    context?: string,
    onChunk?: (text: string) => void
  ): Promise<AgentRunResult> {
    const messages: Anthropic.MessageParam[] = [];
    const toolsUsed: string[] = [];
    let lastVaultPath: string | undefined;

    // 메모리 인젝션: 관련 vault 문서를 컨텍스트에 자동 삽입
    const enrichedContext = await this.buildContextWithMemory(instruction, context);

    const userContent = enrichedContext
      ? `${enrichedContext}## 지시사항\n${instruction}`
      : instruction;

    messages.push({ role: 'user', content: userContent });

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 8096,
        system: this.systemPrompt,
        tools: this.tools as Anthropic.Tool[],
        messages,
      });

      // assistant 응답을 messages에 추가
      messages.push({ role: 'assistant', content: response.content });

      if (response.stop_reason === 'end_turn') {
        // 최종 텍스트 응답 수집
        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('');

        if (onChunk && text) onChunk(text);

        return { output: text, vaultPath: lastVaultPath, toolsUsed };
      }

      if (response.stop_reason === 'tool_use') {
        const toolUseBlocks = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
        );

        // 텍스트가 있으면 스트리밍으로 출력
        const textSoFar = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('');
        if (onChunk && textSoFar) onChunk(textSoFar);

        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolUse of toolUseBlocks) {
          toolsUsed.push(toolUse.name);

          if (onChunk) {
            onChunk(`\n[⚙ ${toolUse.name}: ${JSON.stringify(toolUse.input).slice(0, 80)}]\n`);
          }

          const result = await this.handleToolCall(
            toolUse.name,
            toolUse.input as Record<string, unknown>
          );

          // vault_write 경로 추적
          if (
            toolUse.name === 'vault_write_note' &&
            typeof toolUse.input === 'object' &&
            toolUse.input !== null &&
            'path' in toolUse.input
          ) {
            lastVaultPath = (toolUse.input as { path: string }).path;
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: result,
          });
        }

        messages.push({ role: 'user', content: toolResults });
        continue;
      }

      break;
    }

    return {
      output: '(에이전트가 응답을 완료하지 못했습니다)',
      toolsUsed,
    };
  }

  // 하위 클래스에서 구현 — tool 이름과 입력을 받아 결과 문자열 반환
  protected abstract handleToolCall(
    name: string,
    input: Record<string, unknown>
  ): Promise<string>;
}
