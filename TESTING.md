# 테스트 가이드 — AI오피스2

## 빠른 시작

```bash
# 의존성 설치 (처음 한 번)
npm install

# 테스트 전체 실행
npm test

# 감시 모드 (파일 저장 시 자동 재실행)
npm run test:watch

# 커버리지 리포트 생성
npm run test:coverage
```

---

## 테스트 구조

```
tests/
├── vault.test.ts                 # VaultAPI 단위 테스트 (Node 환경)
├── providers/
│   ├── registry.test.ts          # Provider 레지스트리 함수 (happy-dom 환경)
│   └── contracts.test.ts         # Provider 인터페이스 계약 검증
└── agents/
    └── base.test.ts              # BaseAgent 로직 (Anthropic SDK 모킹)
```

---

## 테스트 영역별 설명

### 1. VaultAPI (`tests/vault.test.ts`)

실제 파일 시스템을 사용하는 순수 Node 환경 테스트입니다.
각 테스트는 `os.tmpdir()` 안에 임시 디렉터리를 만들고, 테스트 종료 후 삭제합니다.

**커버 범위:**
- `writeNote` / `readNote` — 읽기/쓰기 왕복 검증
- `appendToNote` — 기존 파일 추가, 없을 때 생성
- `listNotes` — 폴더 탐색, 재귀, `.md` 필터링
- `searchNotes` — 키워드 매칭, 점수 정렬, snippet 추출
- `noteExists` — 존재 여부 확인
- `sanitizePath` — Windows 금지 문자 치환
- `getRecentNotes` — 최신순 정렬 및 limit

**추가 테스트 작성 시 패턴:**

```typescript
import { VaultAPI } from '../agent-core/memory/vault.js';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

let tmpDir: string;
let vault: VaultAPI;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-test-'));
  vault = new VaultAPI(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});
```

---

### 2. Provider 레지스트리 (`tests/providers/registry.test.ts`)

`localStorage`를 사용하므로 **happy-dom** 환경에서 실행됩니다.
실제 AI API 호출은 전혀 없습니다.

**커버 범위:**
- `getProvider` / `PROVIDERS` — 레지스트리 조회
- `getProviderKey` / `setProviderKey` — 키 CRUD
- `getProviderModel` / `setProviderModel` — 모델 선택 저장
- `getAgentProvider` / `setAgentProvider` — 에이전트별 provider 매핑
- `getAgentMode` / `setAgentMode` — 운영 모드
- `getUserGuidelines` / `setUserGuidelines` — 사용자 지침

각 `beforeEach`에서 `localStorage.clear()`를 호출하여 테스트 간 격리를 보장합니다.

---

### 3. Provider 계약 (`tests/providers/contracts.test.ts`)

모든 provider가 `AIProvider` 인터페이스를 올바르게 구현하는지 런타임에 검증합니다.
새 provider를 추가했을 때 빠르게 누락 필드를 발견할 수 있습니다.

**커버 범위:**
- 필수 필드 존재 (`id`, `name`, `icon`, `docsUrl`, `models`, `defaultModel`)
- `defaultModel`이 `models` 목록에 포함되는지
- 메서드 타입 검증 (`testConnection`, `streamMessage`, `sendMessage`)
- `streamMessage` 반환값이 `AsyncIterable`인지
- 레지스트리 중복 ID 없음 검증

---

### 4. BaseAgent (`tests/agents/base.test.ts`)

Anthropic SDK를 `vi.mock`으로 완전히 교체하여 실제 API 호출 없이 에이전트 로직을 테스트합니다.

**커버 범위:**
- `end_turn` 정상 응답 처리
- `tool_use → end_turn` 시나리오 (tool 실행 확인)
- `onChunk` 스트리밍 콜백 전달
- 연속 tool 호출 및 `toolsUsed` 누적
- `vault_write_note` 시 `vaultPath` 기록
- `context` 전달 시 대화 이력 포함 여부
- vault 메모리 주입 — 검색 호출 여부, 실패 시 graceful degradation

**모킹 패턴:**

```typescript
import { vi } from 'vitest';

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: vi.fn() };
  },
}));

// 응답 빌더
function makeEndTurnResponse(text: string) {
  return {
    stop_reason: 'end_turn',
    content: [{ type: 'text', text }],
  };
}

// 테스트에서
mockClient.messages.create.mockResolvedValueOnce(makeEndTurnResponse('응답'));
```

---

## 환경 설정

### `vitest.config.ts`

```typescript
environmentMatchGlobs: [
  ['tests/providers/registry.test.ts', 'happy-dom'],  // localStorage 필요
],
```

- 기본 환경: `node` (VaultAPI, BaseAgent)
- `registry.test.ts`만 `happy-dom` (localStorage 사용)

---

## 새 테스트 작성 가이드

### 실제 API를 호출하지 않는 원칙

| 대상 | 방법 |
|------|------|
| Anthropic SDK | `vi.mock('@anthropic-ai/sdk', ...)` |
| OpenAI SDK | `vi.mock('openai', ...)` |
| Gemini SDK | `vi.mock('@google/generative-ai', ...)` |
| 파일 시스템 | 임시 디렉터리 사용 (`os.tmpdir()`) |
| localStorage | happy-dom 환경 + `beforeEach`에서 `clear()` |
| Electron IPC | `(window as any).electronAPI = { ... }` 직접 주입 |
| fetch | `vi.stubGlobal('fetch', vi.fn())` |

### 네이밍 컨벤션

```
tests/
  {도메인}.test.ts           # 단일 파일 도메인
  {도메인}/
    {기능}.test.ts           # 하위 기능별 분리
```

테스트 이름은 **한국어**로 작성합니다 (프로젝트 전체 컨벤션).

### 커버리지 목표

| 영역 | 현재 | 목표 |
|------|------|------|
| `agent-core/memory/` | 0% | **90%+** |
| `src/utils/providers/` | 0% | **80%+** |
| `agent-core/agents/` | 0% | **70%+** |
| `agent-core/tools/` | 0% | **60%+** |

---

## 자주 있는 문제

### ESM import 오류
프로젝트가 `"type": "module"`이므로 import 경로에 `.js` 확장자가 필요합니다.
```typescript
// 올바름
import { VaultAPI } from '../agent-core/memory/vault.js';
// 틀림
import { VaultAPI } from '../agent-core/memory/vault';
```

### `window is not defined`
Node 환경에서 `localStorage`를 사용하는 모듈을 테스트할 때 발생합니다.
`vitest.config.ts`의 `environmentMatchGlobs`에 해당 파일을 추가하거나,
테스트 파일 상단에 `@vitest-environment happy-dom` 주석을 추가하세요.

### Anthropic SDK mock이 안 먹힐 때
`vi.mock`은 파일 최상단에서 호이스팅됩니다. mock 정의 전에 실제 모듈을 import하면 무시됩니다.
`import ... from '@anthropic-ai/sdk'`를 `vi.mock` 호출 *이후* 동적 import로 교체하세요.

```typescript
// vi.mock은 항상 먼저
vi.mock('@anthropic-ai/sdk', () => ({ ... }));

// 이후 동적 import
const { default: Anthropic } = await import('@anthropic-ai/sdk');
```
