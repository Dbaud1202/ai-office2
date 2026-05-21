# 다음 개발 계획 — AI오피스2

작성일: 2026-05-12

---

## 현재 상태 요약

| 영역 | 완성도 | 비고 |
|------|--------|------|
| React UI (16개 뷰) | ✅ 90% | 대부분 구현됨 |
| Provider 레이어 (8개) | ✅ 95% | 운영 가능 |
| Agent 시스템 (9개) | ✅ 80% | CLI 동작, UI 연동 부분 확인 필요 |
| Vault 메모리 | ✅ 85% | 기본 동작 완성 |
| Supabase Auth/Sync | 🟡 60% | 구현됨, 실 환경 테스트 미완 |
| 테스트 커버리지 | 🔴 0% → 시작 | 오늘 기반 마련 |
| Electron 패키징 | 🟡 70% | 빌드 스크립트 있음, 서명/배포 미완 |

---

## Phase 1 — 테스트 안정화 (1~2주)

### 1-1. 의존성 설치 및 테스트 실행 확인

```bash
npm install
npm test
```

예상 이슈:
- `contracts.test.ts`에서 `electronBridge.js` import가 `window` 참조할 경우 → mock 추가 필요
- provider `.js` 확장자 path 해결 문제 → `vitest.config.ts`에 `resolve.conditions: ['import']` 추가

### 1-2. 누락 테스트 추가 우선순위

| 파일 | 테스트 대상 | 난이도 |
|------|------------|--------|
| `tests/agents/pm.test.ts` | PMAgent 위임 로직 | 중 |
| `tests/tools/vault.tools.test.ts` | vault_read, vault_write, vault_search | 하 |
| `tests/tools/web.tools.test.ts` | web_search (fetch 모킹) | 중 |
| `tests/orchestrator/index.test.ts` | 메시지 라우팅, 세션 관리 | 중 |
| `tests/utils/usageTracker.test.ts` | 토큰 카운팅 로직 | 하 |

### 1-3. CI 파이프라인 설정

GitHub Actions 또는 로컬 husky pre-commit:

```yaml
# .github/workflows/test.yml
- run: npm ci
- run: npm test
- run: npm run build
```

---

## Phase 2 — 에이전트 품질 개선 (2~3주)

### 2-1. 스트리밍 UI 연동 버그 수정

현재 `ChatContext.tsx`의 pipeline 실행 흐름이 복잡합니다.
에이전트 응답 스트리밍이 UI에서 끊기는 경우 진단 필요:

- `onChunk` 콜백이 React state 업데이트와 충돌하는지 확인
- `flushSync` 또는 `startTransition` 적용 검토

### 2-2. 에이전트 위임 결과 가시성

현재 PMAgent가 researcher → developer로 체이닝할 때 중간 결과가 UI에 잘 보이지 않음.

제안:
- 각 위임 단계를 별도 메시지 버블로 렌더링
- `MessageBubble`에 `agentId` props 기반 아이콘/색상 추가

### 2-3. 위임 깊이 제한 (recursion guard)

`agent.tools.ts`에서 에이전트가 자기 자신에게 위임하는 무한루프 가능성:

```typescript
// 위임 시 호출 스택 추적
const delegationStack = new Set<string>();
if (delegationStack.has(targetAgent)) throw new Error('순환 위임 감지');
delegationStack.add(targetAgent);
```

### 2-4. 신규 에이전트 추가

| 에이전트 | 역할 | 우선순위 |
|---------|------|---------|
| AnalystAgent | 데이터 분석, 보고서 | 높음 |
| DesignerAgent | UI/UX 제안 (텍스트 기반) | 중간 |
| LegalAgent | 계약서/약관 검토 | 낮음 |

---

## Phase 3 — Supabase & 클라우드 동기화 (2주)

### 3-1. 메시지 동기화 검증

`supabase.ts`의 `syncMessages` 함수가 실제로 동작하는지 통합 테스트:

```typescript
// tests/integration/supabase.test.ts (실제 테스트 DB 사용)
// VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 환경변수 필요
```

### 3-2. 구독 플랜 게이팅

`AuthContext`의 `subscription` 상태를 기반으로:
- Free: 에이전트 3명, vault 100MB
- Pro: 에이전트 무제한, vault 무제한, 클라우드 동기화

현재 UI에는 플랜 체크 로직이 없음 → `usePlan` 훅 추가 필요.

### 3-3. 사용량 대시보드 실 데이터 연동

`UsageDashboard`가 현재 `localStorage`의 `usageTracker` 데이터만 읽음.
Supabase에 `daily_usage` 테이블 생성하여 서버 집계 추가.

---

## Phase 4 — Electron 배포 완성 (1주)

### 4-1. 코드 서명 (Windows)

```yaml
# electron-builder.yml
win:
  certificateFile: cert.pfx
  certificatePassword: ${CERT_PASSWORD}
```

### 4-2. 자동 업데이트

`electron-updater` 패키지 추가:

```typescript
// electron/main.cjs
const { autoUpdater } = require('electron-updater');
autoUpdater.checkForUpdatesAndNotify();
```

### 4-3. 배포 채널

- GitHub Releases → electron-builder publish
- 또는 자체 S3 버킷

---

## Phase 5 — UX 완성도 (지속)

### 우선순위 높음

- [ ] **키보드 단축키** — Cmd/Ctrl+K 커맨드 팔레트
- [ ] **메시지 검색** — vault 검색과 연동
- [ ] **에이전트 상태 표시** — 사이드바에 "처리 중" 인디케이터
- [ ] **다크/라이트 테마 토글** — 현재 하드코딩된 다크 테마

### 우선순위 중간

- [ ] **Pipeline 시각화 개선** — 현재 텍스트 기반 → 플로우차트
- [ ] **Vault 편집기** — VaultViewer에서 직접 마크다운 편집
- [ ] **에이전트 커스터마이징 UI** — TeamManager에서 시스템 프롬프트 편집

### 우선순위 낮음

- [ ] **모바일 반응형** (Electron 앱이라 낮은 우선순위)
- [ ] **다국어 지원** (현재 한국어 고정)

---

## 기술 부채

| 항목 | 위치 | 처리 방법 |
|------|------|----------|
| `any` 타입 남용 | `claude.ts`, `openai.ts` filter/map | 명시적 타입 추가 |
| `localStorage` 직접 접근 분산 | providers/index.ts 전체 | `StorageService` 클래스로 추출 |
| 에이전트 시스템 프롬프트 날짜 하드코딩 | `pm.ts` L58 | 런타임 동적 주입으로 변경 |
| `dangerouslyAllowBrowser: true` | `claude.ts` | Electron에서는 main process로 이동 검토 |
| MAX_ITERATIONS 상수 하드코딩 | `base.ts` L6 | 에이전트 설정값으로 외부화 |

---

## 바로 다음 할 일 (이번 주)

1. `npm install` → `npm test` 실행하여 테스트 통과 확인
2. 실패하는 테스트 fix (예상: `electronBridge` import 문제)
3. `tests/tools/vault.tools.test.ts` 추가 (쉬운 것부터)
4. `.env` 설정 후 실제 Claude API로 에이전트 CLI 동작 검증
