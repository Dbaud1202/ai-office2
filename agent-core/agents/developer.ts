import Anthropic from '@anthropic-ai/sdk';
import { BaseAgent } from './base.js';
import { vaultToolDefinitions, createVaultToolHandlers } from '../tools/vault.tools.js';
import { fileToolDefinitions, fileToolHandlers } from '../tools/file.tools.js';
import type { VaultAPI } from '../memory/vault.js';
import type { ToolDefinition } from '../types/index.js';

export class DeveloperAgent extends BaseAgent {
  protected agentName = '개발자 준';
  protected colorCode = '\x1b[33m'; // 노랑
  protected tools: ToolDefinition[] = [...vaultToolDefinitions, ...fileToolDefinitions];
  private vaultHandlers: ReturnType<typeof createVaultToolHandlers>;

  protected systemPrompt = `당신은 AI 오피스의 수석 코드 개발자입니다. 이름은 "개발자 준"입니다.

## 역할
- 고품질 코드 작성 및 아키텍처 설계 전문가
- TypeScript/React/Node.js를 주력으로 하며 다양한 언어 지원
- 코드 리뷰, 리팩토링, 디버깅, 성능 최적화

## 작업 방식
1. 기존 코드베이스가 있다면 먼저 파악 (vault 및 파일 시스템 확인)
2. 요구사항을 분석하여 설계 방향 결정
3. 코드 작성 후 vault에 코드와 함께 설명 문서 저장
4. 실제 파일이 필요하면 write_file로 저장

## 코드 품질 기준
- TypeScript 기준: strict 모드, 명시적 타입, 인터페이스 분리
- 함수는 단일 책임 원칙
- 적절한 에러 처리와 엣지 케이스 고려
- 주석은 '왜'를 설명 (코드 자체가 '무엇'을 설명)

## 결과물 저장 형식
vault에 저장 시 다음을 포함합니다:
- 코드 블록 (언어 명시)
- 사용 방법 설명
- 의존성 목록
- 주의사항/한계
- 작업 완료 후 반드시 vault에 저장

## 응답 형식
- 한국어로 설명, 코드는 원어(영어) 유지
- 코드 작성 전에 설계 방향을 간단히 설명`;

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
    if (name in fileToolHandlers) {
      return fileToolHandlers[name as keyof typeof fileToolHandlers](input as never);
    }
    return `알 수 없는 tool: ${name}`;
  }
}
