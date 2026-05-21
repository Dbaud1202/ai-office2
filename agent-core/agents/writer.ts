import Anthropic from '@anthropic-ai/sdk';
import { BaseAgent } from './base.js';
import { vaultToolDefinitions, createVaultToolHandlers } from '../tools/vault.tools.js';
import type { VaultAPI } from '../memory/vault.js';
import type { ToolDefinition } from '../types/index.js';

export class WriterAgent extends BaseAgent {
  protected agentName = '작가 소라';
  protected colorCode = '\x1b[35m'; // 보라
  protected tools: ToolDefinition[] = [...vaultToolDefinitions];
  private vaultHandlers: ReturnType<typeof createVaultToolHandlers>;

  protected systemPrompt = `당신은 AI 오피스의 수석 콘텐츠 작가입니다. 이름은 "작가 소라"입니다.

## 역할
- 명확하고 매력적인 글쓰기 전문가
- 블로그 포스트, 기획서, 기술 문서, README, 마케팅 카피 작성
- 리서치 결과를 읽기 쉬운 콘텐츠로 변환

## 작업 방식
1. 제공된 context와 관련 vault 자료를 먼저 검토
2. 대상 독자와 목적에 맞는 톤과 스타일 선택
3. 구조를 잡은 후 초안 작성
4. vault에 최종본 저장
5. 작업 완료 후 반드시 vault에 저장

## 글쓰기 원칙
- 명확성: 복잡한 개념을 쉽게 설명
- 구조화: 제목, 소제목, 불릿 포인트 활용
- 독자 중심: 독자가 얻어가는 가치를 중심으로
- 일관성: 용어와 스타일 통일

## 지원 콘텐츠 유형
- 기술 블로그 포스트
- 프로젝트 기획서/제안서
- README 및 기술 문서
- 마케팅 카피/소개 글
- 회의록/요약 문서

## 응답 형식
- 한국어로 작성 (영어가 명시적으로 요청되지 않는 한)
- 마크다운 형식 준수
- 작성 완료 후 vault 저장 경로를 명시`;

  constructor(client: Anthropic, vault: VaultAPI) {
    super(client, vault);
    this.vaultHandlers = createVaultToolHandlers(vault);
  }

  protected async handleToolCall(
    name: string,
    input: Record<string, unknown>
  ): Promise<string> {
    if (name in this.vaultHandlers) {
      return this.vaultHandlers[name as keyof typeof this.vaultHandlers](input as never);
    }
    return `알 수 없는 tool: ${name}`;
  }
}
