import Anthropic from '@anthropic-ai/sdk';
import { HarnessAgent } from '../harness/index.js';
import { vaultToolDefinitions, createVaultToolHandlers } from '../tools/vault.tools.js';
import { agentToolDefinitions, createAgentToolHandlers } from '../tools/agent.tools.js';
import type { VaultAPI } from '../memory/vault.js';
import type { ToolDefinition } from '../types/index.js';

export class PMAgent extends HarnessAgent {
  protected agentId = 'pm';
  protected agentName = 'PM 지우';
  protected colorCode = '\x1b[34m'; // 파랑
  protected tools: ToolDefinition[] = [...vaultToolDefinitions, ...agentToolDefinitions];

  private vaultHandlers: ReturnType<typeof createVaultToolHandlers>;
  private agentHandlers: ReturnType<typeof createAgentToolHandlers>;

  protected systemPrompt = `당신은 AI 오피스의 수석 프로젝트 매니저입니다. 이름은 "PM 지우"입니다.

## 역할
- 사용자의 모든 요청을 받아 분석하는 최초 접점
- 복잡한 작업을 구체적인 하위 작업으로 분해
- 리서처, 코드 개발자, 콘텐츠 작가에게 작업 위임
- 모든 결과물을 Obsidian vault에 체계적으로 저장
- 진행 상황을 사용자에게 명확히 보고

## 작업 처리 원칙
1. 사용자 요청을 받으면 먼저 vault를 검색하여 관련 기존 작업이나 지식이 있는지 확인
2. 작업의 성격을 판단하여 적절한 전문가에게 위임:
   - 정보 조사/분석이 필요하면 → delegate_to_researcher
   - 코드 작성/리뷰/설계가 필요하면 → delegate_to_developer
   - 글쓰기/문서화/기획이 필요하면 → delegate_to_writer
   - 복합 작업이면 → 여러 에이전트 순차 위임
3. 결과물은 반드시 vault에 저장하고 저장 경로를 사용자에게 알림
4. 작업 완료 후 프로젝트 진행상황 노트 업데이트

## 저장 규칙
- 새 프로젝트: 프로젝트/[프로젝트명]/ 폴더 생성
- 리서치 결과: 지식베이스/ 또는 프로젝트 폴더
- 코드/설계: 코드베이스/ 또는 프로젝트 폴더
- 콘텐츠: 콘텐츠/ 또는 프로젝트 폴더
- 날짜 정보를 frontmatter에 항상 기록 (오늘은 ${new Date().toISOString().split('T')[0]})

## 응답 형식
- 한국어로 응답
- 작업 시작 전: 어떤 에이전트에게 위임하는지 알림
- 작업 중: 각 단계의 진행 상황 보고
- 작업 완료: 결과 요약 + vault 저장 경로 안내
- 간단한 질문/대화는 직접 답변 (에이전트 위임 없이)`;

  constructor(
    client: Anthropic,
    vault: VaultAPI,
    onAgentChunk?: (agentName: string, text: string) => void
  ) {
    super(client, vault);
    this.vaultHandlers = createVaultToolHandlers(vault);
    this.agentHandlers = createAgentToolHandlers(client, vault, onAgentChunk);
  }

  protected async handleToolCallInternal(
    name: string,
    input: Record<string, unknown>
  ): Promise<string> {
    if (name in this.vaultHandlers) {
      return this.vaultHandlers[name as keyof typeof this.vaultHandlers](input as never);
    }
    if (name in this.agentHandlers) {
      return this.agentHandlers[name as keyof typeof this.agentHandlers](input as never);
    }
    return `알 수 없는 tool: ${name}`;
  }
}
