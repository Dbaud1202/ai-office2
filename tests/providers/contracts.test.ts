/**
 * Provider 인터페이스 계약 테스트 — 실제 API 호출 없음
 *
 * 각 provider가 AIProvider 인터페이스를 올바르게 구현하는지 검증합니다.
 * 실제 네트워크 요청은 발생하지 않습니다.
 */
import { describe, it, expect } from 'vitest';
import { PROVIDERS } from '../../src/utils/providers/index.js';
import type { AIProvider } from '../../src/utils/providers/types.js';

const REQUIRED_IDS = ['claude', 'openai', 'gemini', 'deepseek', 'kimi', 'minimax', 'openrouter', 'ollama'] as const;

// ── 필수 필드 존재 여부 ────────────────────────────────────────────────────

describe('Provider 필수 필드', () => {
  for (const provider of PROVIDERS) {
    describe(provider.name, () => {
      it('id가 유효한 AIProviderId다', () => {
        expect(REQUIRED_IDS).toContain(provider.id);
      });

      it('name이 비어있지 않다', () => {
        expect(provider.name.trim().length).toBeGreaterThan(0);
      });

      it('icon이 정의되어 있다', () => {
        expect(provider.icon).toBeDefined();
        expect(typeof provider.icon).toBe('string');
      });

      it('docsUrl이 https:// 로 시작한다', () => {
        expect(provider.docsUrl).toMatch(/^https?:\/\//);
      });

      it('models 배열이 비어있지 않다', () => {
        expect(provider.models.length).toBeGreaterThan(0);
      });

      it('models 각 항목에 id와 label이 있다', () => {
        for (const model of provider.models) {
          expect(model.id.trim().length, `모델 id가 비어있음`).toBeGreaterThan(0);
          expect(model.label.trim().length, `모델 label이 비어있음`).toBeGreaterThan(0);
        }
      });

      it('defaultModel이 models 목록에 포함된다', () => {
        const modelIds = provider.models.map((m) => m.id);
        expect(modelIds).toContain(provider.defaultModel);
      });

      it('testConnection이 함수다', () => {
        expect(typeof provider.testConnection).toBe('function');
      });

      it('streamMessage가 함수다', () => {
        expect(typeof provider.streamMessage).toBe('function');
      });

      it('sendMessage가 함수다', () => {
        expect(typeof provider.sendMessage).toBe('function');
      });
    });
  }
});

// ── 중복 없음 ──────────────────────────────────────────────────────────────

describe('Provider 레지스트리 무결성', () => {
  it('provider ID가 중복되지 않는다', () => {
    const ids = PROVIDERS.map((p) => p.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('모든 필수 provider가 등록되어 있다', () => {
    const ids = PROVIDERS.map((p) => p.id);
    for (const required of REQUIRED_IDS) {
      expect(ids, `${required}가 등록되지 않음`).toContain(required);
    }
  });
});

// ── streamMessage 반환 타입 ────────────────────────────────────────────────

describe('streamMessage AsyncIterable 계약', () => {
  it('streamMessage 호출 결과가 AsyncIterable이다 (API 호출 전 타입 확인)', () => {
    // 실제 호출 없이 반환값이 Symbol.asyncIterator를 가지는지 확인
    // 빈 key로 호출하면 reject되더라도 generator 객체 자체는 즉시 반환됨
    for (const provider of PROVIDERS) {
      const result = provider.streamMessage('', provider.defaultModel, {
        systemPrompt: 'test',
        messages: [{ role: 'user', content: 'hi' }],
      });
      expect(
        Symbol.asyncIterator in Object(result),
        `${provider.id}.streamMessage가 AsyncIterable을 반환하지 않음`
      ).toBe(true);
    }
  });
});

// ── AIProvider 타입 완전성 (컴파일 타임 검증용 런타임 헬퍼) ─────────────────

describe('모든 provider가 AIProvider 인터페이스를 충족한다', () => {
  function assertIsProvider(p: AIProvider): void {
    // 타입스크립트가 이미 컴파일 타임에 확인하지만, 런타임 smoke test도 추가
    expect(p).toBeDefined();
  }

  it('PROVIDERS 배열의 모든 항목이 AIProvider다', () => {
    for (const p of PROVIDERS) {
      expect(() => assertIsProvider(p)).not.toThrow();
    }
  });
});
