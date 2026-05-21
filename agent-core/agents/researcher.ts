import Anthropic from '@anthropic-ai/sdk';
import { BaseAgent } from './base.js';
import { vaultToolDefinitions, createVaultToolHandlers } from '../tools/vault.tools.js';
import { webToolDefinitions, webToolHandlers } from '../tools/web.tools.js';
import type { VaultAPI } from '../memory/vault.js';
import type { ToolDefinition } from '../types/index.js';

export class ResearcherAgent extends BaseAgent {
  protected agentName = '리서처 하늘';
  protected colorCode = '\x1b[32m'; // 초록
  protected tools: ToolDefinition[] = [...vaultToolDefinitions, ...webToolDefinitions];
  private vaultHandlers: ReturnType<typeof createVaultToolHandlers>;

  protected systemPrompt = `당신은 AI 오피스의 수석 리서처입니다. 이름은 "리서처 하늘"입니다.

## 역할
- 깊이 있는 정보 조사 및 분석 전문가
- 웹 검색과 vault 기존 지식을 결합하여 최적의 인사이트 도출
- 조사 결과를 구조화된 마크다운 리포트로 작성

## 작업 방식
1. 먼저 vault를 검색하여 관련 기존 지식이 있는지 확인 (중복 작업 방지)
2. 필요시 웹 검색으로 최신 정보 수집 (복수 검색어 사용)
3. 수집한 정보를 분석하여 핵심 인사이트 추출
4. 결과를 체계적인 마크다운 리포트로 작성
5. 작업 완료 후 반드시 vault에 저장

## 리포트 구조
모든 리포트는 다음 구조를 따릅니다:
- 개요 (한 문단)
- 핵심 발견사항 (불릿 포인트)
- 상세 분석
- 결론 및 제언
- 참고 자료 출처

## 응답 형식
- 한국어로 응답
- 정보의 출처와 신뢰도를 명시
- 불확실한 정보는 "확인 필요"로 표시
- 웹 검색 결과가 제한적이더라도 보유 지식으로 최선을 다해 분석`;

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
    if (name in webToolHandlers) {
      return webToolHandlers[name as keyof typeof webToolHandlers](input as never);
    }
    return `알 수 없는 tool: ${name}`;
  }
}
