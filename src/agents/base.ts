import Anthropic from '@anthropic-ai/sdk';
import type { ToolDefinition, AgentRunResult } from '../types/index.js';

const DEFAULT_MAX_ITERATIONS = 10;

export abstract class BaseAgent {
  protected client: Anthropic;
  protected abstract systemPrompt: string;
  protected abstract tools: ToolDefinition[];
  protected abstract agentName: string;
  protected abstract colorCode: string;

  constructor(client: Anthropic) {
    this.client = client;
  }

  // ── Harness extension points ──────────────────────────────────────────────

  // Override to inject soul + memory into the system prompt (used by HarnessAgent)
  protected async resolveSystemPrompt(): Promise<string> {
    return this.systemPrompt;
  }

  // Override to change per-agent iteration budget
  protected getMaxIterations(): number {
    return DEFAULT_MAX_ITERATIONS;
  }

  // Called before each tool execution — override for permission checks or audit hooks
  protected async onBeforeToolCall(
    _name: string,
    _input: Record<string, unknown>
  ): Promise<void> {}

  // Called after each tool execution — override for result logging or hooks
  protected async onAfterToolCall(
    _name: string,
    _result: string
  ): Promise<void> {}

  // ── Core run loop ─────────────────────────────────────────────────────────

  async run(
    instruction: string,
    context?: string,
    onChunk?: (text: string) => void
  ): Promise<AgentRunResult> {
    const messages: Anthropic.MessageParam[] = [];
    const toolsUsed: string[] = [];
    let lastVaultPath: string | undefined;

    const userContent = context
      ? `## 컨텍스트\n${context}\n\n## 지시사항\n${instruction}`
      : instruction;

    messages.push({ role: 'user', content: userContent });

    const systemPrompt = await this.resolveSystemPrompt();
    const maxIterations = this.getMaxIterations();

    for (let i = 0; i < maxIterations; i++) {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8096,
        system: systemPrompt,
        tools: this.tools as Anthropic.Tool[],
        messages,
      });

      messages.push({ role: 'assistant', content: response.content });

      if (response.stop_reason === 'end_turn') {
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

        const textSoFar = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('');
        if (onChunk && textSoFar) onChunk(textSoFar);

        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolUse of toolUseBlocks) {
          const input = toolUse.input as Record<string, unknown>;
          toolsUsed.push(toolUse.name);

          if (onChunk) {
            onChunk(`\n[⚙ ${toolUse.name}: ${JSON.stringify(input).slice(0, 80)}]\n`);
          }

          await this.onBeforeToolCall(toolUse.name, input);
          const result = await this.handleToolCall(toolUse.name, input);
          await this.onAfterToolCall(toolUse.name, result);

          if (toolUse.name === 'vault_write_note' && typeof input?.path === 'string') {
            lastVaultPath = input.path;
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

    return { output: '(에이전트가 응답을 완료하지 못했습니다)', toolsUsed };
  }

  protected abstract handleToolCall(
    name: string,
    input: Record<string, unknown>
  ): Promise<string>;
}
