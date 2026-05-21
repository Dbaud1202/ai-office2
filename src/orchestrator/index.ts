import Anthropic from '@anthropic-ai/sdk';
import { PMAgent } from '../agents/pm.js';
import { VaultAPI } from '../memory/vault.js';
import { globalHooks } from '../harness/hooks.js';
import type { Session, ConversationTurn } from '../types/index.js';

function now(): string {
  return new Date().toISOString();
}

export class Orchestrator {
  private client: Anthropic;
  private vault: VaultAPI;
  private session: Session;
  private pmAgent: PMAgent;
  private onChunk: (agentName: string, text: string) => void;

  constructor(
    apiKey: string,
    vaultRoot: string,
    onChunk: (agentName: string, text: string) => void
  ) {
    this.client = new Anthropic({ apiKey });
    this.vault = new VaultAPI(vaultRoot);
    this.onChunk = onChunk;

    this.session = {
      id: Date.now().toString(),
      startedAt: now(),
      history: [],
      activeTasks: [],
    };

    this.pmAgent = new PMAgent(
      this.client,
      this.vault,
      (agentName, text) => onChunk(agentName, text)
    );

    this.registerHarnessHooks();
  }

  // ── Harness hook registrations ────────────────────────────────────────────

  private registerHarnessHooks(): void {
    // Structured audit output for every tool call
    globalHooks.register('before_tool_call', (ctx) => {
      const ts = new Date().toLocaleTimeString('ko-KR', { hour12: false });
      process.stderr.write(
        `\x1b[90m[${ts}][하네스] ${ctx.agentName ?? ctx.agentId} → ${ctx.toolName}\x1b[0m\n`
      );
    });

    // Write completed-run summary to vault audit log (fire-and-forget)
    globalHooks.register('after_run', (ctx) => {
      if (!ctx.output || ctx.output.length < 10) return;
      const entry =
        `### ${now()} | ${ctx.agentName ?? ctx.agentId}\n` +
        `**지시사항**: ${(ctx.instruction ?? '').slice(0, 120)}\n` +
        `**결과 요약**: ${ctx.output.slice(0, 300)}\n`;
      this.vault
        .appendToNote('에이전트-로그/audit.md', entry)
        .catch(() => {});
    });

    // Log errors to vault so they accumulate for review
    globalHooks.register('on_error', (ctx) => {
      const entry =
        `### ${now()} | ERROR | ${ctx.agentName ?? ctx.agentId}\n` +
        `${ctx.error?.message ?? '알 수 없는 오류'}\n`;
      this.vault
        .appendToNote('에이전트-로그/errors.md', entry)
        .catch(() => {});
    });
  }

  // ── Main message handler ──────────────────────────────────────────────────

  async processUserMessage(userMessage: string): Promise<string> {
    const turn: ConversationTurn = {
      role: 'user',
      content: userMessage,
      timestamp: now(),
    };
    this.session.history.push(turn);

    // Provide up to 6 recent turns as conversation context
    const recentHistory = this.session.history.slice(-6);
    const historyContext =
      recentHistory.length > 1
        ? recentHistory
            .slice(0, -1)
            .map((t) => `[${t.role === 'user' ? '사용자' : 'PM 지우'}]: ${t.content}`)
            .join('\n')
        : undefined;

    const result = await this.pmAgent.run(
      userMessage,
      historyContext,
      (text) => {
        this.onChunk('PM 지우', text);
      }
    );

    const assistantTurn: ConversationTurn = {
      role: 'assistant',
      content: result.output,
      agentId: 'pm',
      timestamp: now(),
    };
    this.session.history.push(assistantTurn);

    return result.output;
  }

  getVault(): VaultAPI {
    return this.vault;
  }

  getSession(): Session {
    return this.session;
  }
}
