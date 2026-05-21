import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ToolDefinition, AgentRunResult } from '../../agent-core/types/index.js';
import { BaseAgent } from '../../agent-core/agents/base.js';

// ── Anthropic SDK 전체 모킹 ─────────────────────────────────────────────

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: vi.fn(),
      };
    },
  };
});

// ── 테스트용 ConcreteAgent ──────────────────────────────────────────────

class TestAgent extends BaseAgent {
  protected agentName = 'TestAgent';
  protected colorCode = '';
  protected systemPrompt = '테스트 에이전트입니다.';
  protected tools: ToolDefinition[] = [
    {
      name: 'echo_tool',
      description: '입력을 그대로 반환',
      input_schema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: '에코할 메시지' },
        },
        required: ['message'],
      },
    },
  ];

  // 각 테스트에서 주입
  public toolHandler: (name: string, input: Record<string, unknown>) => Promise<string>;

  constructor(client: any, vault?: any) {
    super(client, vault);
    this.toolHandler = async (name, input) => `[${name}] ${JSON.stringify(input)}`;
  }

  protected async handleToolCall(name: string, input: Record<string, unknown>): Promise<string> {
    return this.toolHandler(name, input);
  }
}

// ── 헬퍼: Anthropic 응답 빌더 ─────────────────────────────────────────

function makeEndTurnResponse(text: string) {
  return {
    stop_reason: 'end_turn',
    content: [{ type: 'text', text }],
  };
}

function makeToolUseResponse(toolName: string, toolInput: Record<string, unknown>, id = 'tool-1') {
  return {
    stop_reason: 'tool_use',
    content: [
      { type: 'tool_use', id, name: toolName, input: toolInput },
    ],
  };
}

function makeToolUseWithTextResponse(
  text: string,
  toolName: string,
  toolInput: Record<string, unknown>,
  id = 'tool-1'
) {
  return {
    stop_reason: 'tool_use',
    content: [
      { type: 'text', text },
      { type: 'tool_use', id, name: toolName, input: toolInput },
    ],
  };
}

// ── 테스트 ─────────────────────────────────────────────────────────────

describe('BaseAgent.run', () => {
  let mockClient: any;
  let agent: TestAgent;

  beforeEach(async () => {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    mockClient = new Anthropic();
    agent = new TestAgent(mockClient);
  });

  it('end_turn 응답을 받으면 텍스트를 반환한다', async () => {
    mockClient.messages.create.mockResolvedValueOnce(makeEndTurnResponse('안녕하세요!'));

    const result: AgentRunResult = await agent.run('테스트 지시사항');

    expect(result.output).toBe('안녕하세요!');
    expect(result.toolsUsed).toEqual([]);
  });

  it('tool_use → end_turn 시나리오에서 tool이 실행된다', async () => {
    mockClient.messages.create
      .mockResolvedValueOnce(makeToolUseResponse('echo_tool', { message: '안녕' }))
      .mockResolvedValueOnce(makeEndTurnResponse('에코 완료'));

    const toolSpy = vi.fn().mockResolvedValue('에코: 안녕');
    agent.toolHandler = toolSpy;

    const result = await agent.run('에코 테스트');

    expect(toolSpy).toHaveBeenCalledWith('echo_tool', { message: '안녕' });
    expect(result.output).toBe('에코 완료');
    expect(result.toolsUsed).toContain('echo_tool');
  });

  it('onChunk 콜백에 텍스트가 전달된다', async () => {
    mockClient.messages.create.mockResolvedValueOnce(makeEndTurnResponse('청크 텍스트'));

    const chunks: string[] = [];
    await agent.run('청크 테스트', undefined, (t) => chunks.push(t));

    expect(chunks).toContain('청크 텍스트');
  });

  it('tool_use 응답에 텍스트가 섞여도 onChunk에 전달된다', async () => {
    mockClient.messages.create
      .mockResolvedValueOnce(
        makeToolUseWithTextResponse('중간 텍스트', 'echo_tool', { message: 'hi' })
      )
      .mockResolvedValueOnce(makeEndTurnResponse('최종'));

    const chunks: string[] = [];
    await agent.run('복합 테스트', undefined, (t) => chunks.push(t));

    expect(chunks).toContain('중간 텍스트');
    expect(chunks.some((c) => c.includes('echo_tool'))).toBe(true); // tool 이름 출력
  });

  it('연속 tool 호출도 모두 toolsUsed에 기록된다', async () => {
    mockClient.messages.create
      .mockResolvedValueOnce(makeToolUseResponse('echo_tool', { message: '1' }, 'tool-1'))
      .mockResolvedValueOnce(makeToolUseResponse('echo_tool', { message: '2' }, 'tool-2'))
      .mockResolvedValueOnce(makeEndTurnResponse('완료'));

    const result = await agent.run('연속 tool 호출');
    expect(result.toolsUsed).toEqual(['echo_tool', 'echo_tool']);
  });

  it('vault_write_note 호출 시 vaultPath가 기록된다', async () => {
    mockClient.messages.create
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'v-1',
            name: 'vault_write_note',
            input: { path: '프로젝트/테스트.md', content: '내용' },
          },
        ],
      })
      .mockResolvedValueOnce(makeEndTurnResponse('저장 완료'));

    const result = await agent.run('vault 저장 테스트');
    expect(result.vaultPath).toBe('프로젝트/테스트.md');
  });

  it('context가 전달되면 지시사항에 대화 이력이 포함된다', async () => {
    mockClient.messages.create.mockResolvedValueOnce(makeEndTurnResponse('응답'));

    await agent.run('새 지시', '이전 대화 내용');

    const callArg = mockClient.messages.create.mock.calls[0][0];
    const userContent = callArg.messages[0].content as string;
    expect(userContent).toContain('이전 대화 내용');
    expect(userContent).toContain('새 지시');
  });

  it('messages.create에 systemPrompt가 전달된다', async () => {
    mockClient.messages.create.mockResolvedValueOnce(makeEndTurnResponse('응답'));

    await agent.run('지시사항');

    const callArg = mockClient.messages.create.mock.calls[0][0];
    expect(callArg.system).toBe('테스트 에이전트입니다.');
  });
});

// ── vault 메모리 주입 테스트 ───────────────────────────────────────────

describe('BaseAgent vault 메모리 주입', () => {
  it('vault가 있으면 관련 노트를 검색한다', async () => {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const mockClient = new Anthropic();
    mockClient.messages.create.mockResolvedValueOnce(makeEndTurnResponse('응답'));

    const mockVault = {
      searchNotes: vi.fn().mockResolvedValue([
        {
          note: { title: '관련 노트', content: '관련 내용입니다.' },
          snippet: '관련 내용입니다.',
          score: 1,
        },
      ]),
    };

    const agentWithVault = new TestAgent(mockClient, mockVault);
    await agentWithVault.run('관련 키워드 포함 지시사항');

    expect(mockVault.searchNotes).toHaveBeenCalledWith('관련 키워드 포함 지시사항');

    const callArg = mockClient.messages.create.mock.calls[0][0];
    const userContent = callArg.messages[0].content as string;
    expect(userContent).toContain('관련 기억');
    expect(userContent).toContain('관련 노트');
  });

  it('vault 검색 실패해도 에러 없이 진행된다', async () => {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const mockClient = new Anthropic();
    mockClient.messages.create.mockResolvedValueOnce(makeEndTurnResponse('응답'));

    const mockVault = {
      searchNotes: vi.fn().mockRejectedValue(new Error('vault 오류')),
    };

    const agentWithVault = new TestAgent(mockClient, mockVault);
    const result = await agentWithVault.run('지시사항');

    expect(result.output).toBe('응답'); // 에러 없이 정상 응답
  });

  it('vault 결과가 없으면 메모리 섹션이 생략된다', async () => {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const mockClient = new Anthropic();
    mockClient.messages.create.mockResolvedValueOnce(makeEndTurnResponse('응답'));

    const mockVault = {
      searchNotes: vi.fn().mockResolvedValue([]),
    };

    const agentWithVault = new TestAgent(mockClient, mockVault);
    await agentWithVault.run('지시사항');

    const callArg = mockClient.messages.create.mock.calls[0][0];
    const userContent = callArg.messages[0].content as string;
    expect(userContent).not.toContain('관련 기억');
  });
});
