import Anthropic from '@anthropic-ai/sdk';
import type { VaultAPI } from '../memory/vault.js';
import type { AgentRunResult } from '../types/index.js';
import { BaseAgent } from '../agents/base.js';
import { loadSoul } from './soul.js';
import { buildMemoryContext, saveAgentInsight } from './memory.js';
import { checkToolPermission, getDeniedReason } from './constraints.js';
import { withRetry } from './feedback.js';
import { globalHooks } from './hooks.js';
import { HARNESS_CONFIG } from './config.js';

/**
 * HarnessAgent wraps BaseAgent with all five harness layers:
 *   1. Soul Layer      — SOUL.md personality injected into system prompt
 *   2. Memory Layer    — Cross-session MEMORY.md injected into system prompt
 *   3. Constraint Layer — Tool permission matrix enforced before every tool call
 *   4. Feedback Layer  — Exponential-backoff retry on transient API errors
 *   5. Hook Layer      — Lifecycle events fired before/after runs and tool calls
 */
export abstract class HarnessAgent extends BaseAgent {
  protected abstract agentId: string;
  protected vault: VaultAPI;

  // Cached enriched prompt — reset at the start of each run so memory stays fresh
  private _resolvedPrompt: string | null = null;

  constructor(client: Anthropic, vault: VaultAPI) {
    super(client);
    this.vault = vault;
  }

  // ── Layer 1 + 2: Soul + Memory ────────────────────────────────────────────

  protected override getMaxIterations(): number {
    return HARNESS_CONFIG.maxIterations;
  }

  protected override async resolveSystemPrompt(): Promise<string> {
    if (this._resolvedPrompt) return this._resolvedPrompt;

    const [soul, memoryCtx] = await Promise.all([
      loadSoul(this.agentId),
      buildMemoryContext(this.agentId, this.vault),
    ]);

    const parts: string[] = [];
    if (soul) parts.push(`## 에이전트 소울\n${soul}`);
    parts.push(this.systemPrompt);
    if (memoryCtx) parts.push(memoryCtx);

    this._resolvedPrompt = parts.join('\n\n---\n\n');
    return this._resolvedPrompt;
  }

  // ── Layer 3: Constraint (permission gate) ─────────────────────────────────

  // Subclasses implement handleToolCallInternal instead of handleToolCall
  protected abstract handleToolCallInternal(
    name: string,
    input: Record<string, unknown>
  ): Promise<string>;

  protected override async handleToolCall(
    name: string,
    input: Record<string, unknown>
  ): Promise<string> {
    if (!checkToolPermission(this.agentId, name)) {
      return getDeniedReason(this.agentId, name);
    }
    return this.handleToolCallInternal(name, input);
  }

  // ── Layer 5: Hooks (before/after tool calls) ──────────────────────────────

  protected override async onBeforeToolCall(
    name: string,
    input: Record<string, unknown>
  ): Promise<void> {
    await globalHooks.fire('before_tool_call', {
      agentId: this.agentId,
      agentName: this.agentName,
      toolName: name,
      toolInput: input,
    });
  }

  protected override async onAfterToolCall(name: string, result: string): Promise<void> {
    await globalHooks.fire('after_tool_call', {
      agentId: this.agentId,
      agentName: this.agentName,
      toolName: name,
      toolResult: result.slice(0, 200),
    });
  }

  // ── Layer 4 + 5: Retry + run-level hooks ──────────────────────────────────

  override async run(
    instruction: string,
    context?: string,
    onChunk?: (text: string) => void
  ): Promise<AgentRunResult> {
    // Reset prompt cache so memory is always up-to-date
    this._resolvedPrompt = null;

    await globalHooks.fire('before_run', {
      agentId: this.agentId,
      agentName: this.agentName,
      instruction,
    });

    let result: AgentRunResult;
    try {
      result = await withRetry(
        () => super.run(instruction, context, onChunk),
        {
          onRetry: (attempt, err) => {
            onChunk?.(`\n[⚠ 하네스 재시도 ${attempt}회: ${err.message.slice(0, 60)}]\n`);
          },
        }
      );
    } catch (err) {
      await globalHooks.fire('on_error', {
        agentId: this.agentId,
        agentName: this.agentName,
        error: err instanceof Error ? err : new Error(String(err)),
      });
      throw err;
    }

    // Persist compressed insight for future sessions (fire-and-forget)
    if (result.output.length > 20) {
      const insight = `${instruction.slice(0, 60)} → ${result.output.slice(0, 120)}`;
      saveAgentInsight(this.agentId, this.vault, insight).catch(() => {});
    }

    await globalHooks.fire('after_run', {
      agentId: this.agentId,
      agentName: this.agentName,
      instruction,
      output: result.output,
    });

    return result;
  }
}
