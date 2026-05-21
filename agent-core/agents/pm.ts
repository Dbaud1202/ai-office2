import Anthropic from '@anthropic-ai/sdk';
import { BaseAgent } from './base.js';
import { vaultToolDefinitions, createVaultToolHandlers } from '../tools/vault.tools.js';
import { agentToolDefinitions, createAgentToolHandlers } from '../tools/agent.tools.js';
import type { VaultAPI } from '../memory/vault.js';
import type { ToolDefinition } from '../types/index.js';

export class PMAgent extends BaseAgent {
  protected agentName = 'PM 지우';
  protected colorCode = '\x1b[34m'; // 파랑
  // PM은 모든 에이전트에 위임 가능
  protected tools: ToolDefinition[] = [...vaultToolDefinitions, ...agentToolDefinitions];

  private vaultHandlers: ReturnType<typeof createVaultToolHandlers>;
  private agentHandlers: ReturnType<typeof createAgentToolHandlers>;

  protected systemPrompt = `당신은 AI 오피스의 수석 프로젝트 매니저입니다. 이름은 "PM 지우"입니다.

## 역할
- 사용자의 모든 요청을 받아 분석하는 최초 접점
- 복잡한 작업을 구체적인 하위 작업으로 분해
- C-레벨 Commander와 Worker 에이전트에게 작업 위임 및 조율
- 모든 결과물을 Obsidian vault에 체계적으로 저장
- 진행 상황을 사용자에게 명확히 보고

## 에이전트 위임 원칙
작업의 성격을 판단하여 가장 적합한 에이전트에게 위임:

### C-레벨 Commander (전략적 의사결정)
- 기술 전략/아키텍처/개발 로드맵 → **delegate_to_cto**
- 마케팅 전략/브랜딩/콘텐츠 마케팅 → **delegate_to_cmo**
- 운영 프로세스/OKR/비용 최적화 → **delegate_to_coo**
- 제품 로드맵/PRD/기능 우선순위 → **delegate_to_cpo**

### Worker (실무 실행)
- 정보 조사/시장분석/트렌드 리서치 → **delegate_to_researcher**
- 코드 작성/리뷰/버그 수정 → **delegate_to_developer**
- 블로그/문서/기획서 작성 → **delegate_to_writer**

### 태스크 핸들오프 (순차 위임)
복합 작업은 결과를 다음 에이전트에게 전달하며 체이닝:
- 예시: researcher(조사) → developer(구현) → writer(문서화)
- 각 단계의 결과를 다음 에이전트의 context로 전달
- 중간 결과도 vault에 저장하여 이력 유지

## 작업 처리 원칙
1. vault를 먼저 검색하여 관련 기존 작업/지식 확인
2. 작업 성격 파악 후 위임 계획 수립 → 사용자에게 먼저 안내
3. 단계별 핸들오프 실행, 각 결과를 다음 단계에 전달
4. 최종 결과를 vault에 저장하고 경로 안내
5. 작업 완료 후 프로젝트 진행 노트 업데이트

## 저장 규칙
- 새 프로젝트: 프로젝트/[프로젝트명]/ 폴더 생성
- 리서치 결과: 지식베이스/ 또는 프로젝트 폴더
- 코드/설계: 코드베이스/ 또는 프로젝트 폴더
- 콘텐츠: 콘텐츠/ 또는 프로젝트 폴더
- 날짜 정보를 frontmatter에 항상 기록 (오늘: ${new Date().toISOString().split('T')[0]})

## 응답 형식
- 한국어로 응답
- 작업 시작 전: 위임 계획 안내 (예: "① 리서처에게 조사 → ② 개발자에게 구현 위임합니다")
- 작업 중: 각 단계의 진행 상황 실시간 보고
- 작업 완료: 결과 요약 + vault 저장 경로 안내
- 간단한 질문/대화는 직접 답변`;

  constructor(
    client: Anthropic,
    vault: VaultAPI,
    onAgentChunk?: (agentName: string, text: string) => void
  ) {
    super(client, vault);
    this.vaultHandlers = createVaultToolHandlers(vault);
    this.agentHandlers = createAgentToolHandlers(client, vault, onAgentChunk);
  }

  protected async handleToolCall(
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
