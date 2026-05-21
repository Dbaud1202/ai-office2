/**
 * @vitest-environment happy-dom
 *
 * Provider 레지스트리 함수 테스트.
 * localStorage를 사용하므로 happy-dom 환경에서 실행됩니다.
 * 실제 AI API 호출은 하지 않습니다.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getProvider,
  getProviderKey,
  setProviderKey,
  getProviderModel,
  setProviderModel,
  getAgentProvider,
  setAgentProvider,
  getAgentMode,
  setAgentMode,
  getUserGuidelines,
  setUserGuidelines,
  PROVIDERS,
} from '../../src/utils/providers/index.js';
import type { AIProviderId } from '../../src/utils/providers/types.js';

beforeEach(() => {
  localStorage.clear();
});

// ── getProvider ───────────────────────────────────────────────────────────

describe('getProvider', () => {
  it('등록된 모든 provider ID로 조회할 수 있다', () => {
    const ids: AIProviderId[] = ['claude', 'openai', 'gemini', 'deepseek', 'kimi', 'minimax', 'openrouter', 'ollama'];
    for (const id of ids) {
      expect(getProvider(id), `${id} provider가 없음`).toBeDefined();
    }
  });

  it('존재하지 않는 ID는 undefined를 반환한다', () => {
    expect(getProvider('nonexistent' as AIProviderId)).toBeUndefined();
  });

  it('PROVIDERS 배열과 getProvider 결과가 일치한다', () => {
    for (const provider of PROVIDERS) {
      expect(getProvider(provider.id)).toBe(provider);
    }
  });
});

// ── getProviderKey / setProviderKey ───────────────────────────────────────

describe('getProviderKey / setProviderKey', () => {
  it('키를 저장하고 읽어올 수 있다', () => {
    setProviderKey('claude', 'sk-ant-test-123');
    expect(getProviderKey('claude')).toBe('sk-ant-test-123');
  });

  it('빈 문자열을 저장하면 키가 삭제된다', () => {
    setProviderKey('openai', 'sk-test');
    setProviderKey('openai', '');
    expect(getProviderKey('openai')).toBe('');
  });

  it('설정하지 않은 provider는 빈 문자열을 반환한다', () => {
    expect(getProviderKey('gemini')).toBe('');
  });

  it('provider별로 독립적으로 저장된다', () => {
    setProviderKey('claude', 'key-a');
    setProviderKey('openai', 'key-b');
    expect(getProviderKey('claude')).toBe('key-a');
    expect(getProviderKey('openai')).toBe('key-b');
  });
});

// ── getProviderModel / setProviderModel ───────────────────────────────────

describe('getProviderModel / setProviderModel', () => {
  it('모델을 저장하고 읽어올 수 있다', () => {
    setProviderModel('claude', 'claude-opus-4-5');
    expect(getProviderModel('claude', 'claude-sonnet-4-6')).toBe('claude-opus-4-5');
  });

  it('저장된 모델이 없으면 defaultModel을 반환한다', () => {
    expect(getProviderModel('gemini', 'gemini-2.5-pro')).toBe('gemini-2.5-pro');
  });

  it('provider별로 독립적인 모델을 저장한다', () => {
    setProviderModel('claude', 'claude-haiku-4-5-20251001');
    setProviderModel('openai', 'gpt-4.1');
    expect(getProviderModel('claude', '')).toBe('claude-haiku-4-5-20251001');
    expect(getProviderModel('openai', '')).toBe('gpt-4.1');
  });
});

// ── getAgentProvider / setAgentProvider ───────────────────────────────────

describe('getAgentProvider / setAgentProvider', () => {
  it('에이전트별 provider를 저장하고 읽을 수 있다', () => {
    setAgentProvider('pm', 'claude');
    expect(getAgentProvider('pm')).toBe('claude');
  });

  it('null로 설정하면 provider가 제거된다', () => {
    setAgentProvider('cto', 'openai');
    setAgentProvider('cto', null);
    expect(getAgentProvider('cto')).toBeNull();
  });

  it('설정하지 않은 에이전트는 null을 반환한다', () => {
    expect(getAgentProvider('researcher')).toBeNull();
  });

  it('에이전트별로 독립적으로 저장된다', () => {
    setAgentProvider('pm', 'claude');
    setAgentProvider('cto', 'openai');
    expect(getAgentProvider('pm')).toBe('claude');
    expect(getAgentProvider('cto')).toBe('openai');
  });

  it('레거시 맵 형식(ao2-agent-provider)도 읽어온다', () => {
    // 구버전 형식으로 직접 저장
    localStorage.setItem('ao2-agent-provider', JSON.stringify({ developer: 'gemini' }));
    expect(getAgentProvider('developer')).toBe('gemini');
  });

  it('레거시보다 직접 저장 방식이 우선한다', () => {
    localStorage.setItem('ao2-agent-provider', JSON.stringify({ pm: 'gemini' }));
    setAgentProvider('pm', 'claude');
    expect(getAgentProvider('pm')).toBe('claude');
  });
});

// ── getAgentMode / setAgentMode ───────────────────────────────────────────

describe('getAgentMode', () => {
  it('기본값은 careful이다', () => {
    expect(getAgentMode()).toBe('careful');
  });

  it('auto로 변경할 수 있다', () => {
    setAgentMode('auto');
    expect(getAgentMode()).toBe('auto');
  });

  it('careful로 되돌릴 수 있다', () => {
    setAgentMode('auto');
    setAgentMode('careful');
    expect(getAgentMode()).toBe('careful');
  });
});

// ── getUserGuidelines / setUserGuidelines ─────────────────────────────────

describe('getUserGuidelines', () => {
  it('기본값은 빈 문자열이다', () => {
    expect(getUserGuidelines()).toBe('');
  });

  it('가이드라인을 저장하고 읽을 수 있다', () => {
    setUserGuidelines('항상 한국어로 답해주세요.');
    expect(getUserGuidelines()).toBe('항상 한국어로 답해주세요.');
  });

  it('공백만 있는 문자열은 저장하지 않는다', () => {
    setUserGuidelines('   ');
    expect(getUserGuidelines()).toBe('');
  });

  it('빈 문자열 설정 시 기존 값이 삭제된다', () => {
    setUserGuidelines('기존 가이드라인');
    setUserGuidelines('');
    expect(getUserGuidelines()).toBe('');
  });
});
