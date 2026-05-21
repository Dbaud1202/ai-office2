export type HookEvent =
  | 'before_run'
  | 'after_run'
  | 'before_tool_call'
  | 'after_tool_call'
  | 'on_error';

export interface HookContext {
  agentId?: string;
  agentName?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: string;
  instruction?: string;
  output?: string;
  error?: Error;
  sessionId?: string;
}

type HookFn = (ctx: HookContext) => void | Promise<void>;

export class HarnessHookSystem {
  private hooks = new Map<HookEvent, HookFn[]>();

  register(event: HookEvent, fn: HookFn): void {
    const existing = this.hooks.get(event) ?? [];
    this.hooks.set(event, [...existing, fn]);
  }

  async fire(event: HookEvent, ctx: HookContext): Promise<void> {
    const fns = this.hooks.get(event) ?? [];
    for (const fn of fns) {
      try {
        await fn(ctx);
      } catch {
        // Hook errors must never crash the agent
      }
    }
  }
}

// Global singleton used by all harness agents
export const globalHooks = new HarnessHookSystem();
