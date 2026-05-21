# AI 오피스2 — AI Agent Team Platform

> **Build your own AI agent team** and delegate complex tasks in natural language.  
> PM, Researcher, Developer, and Writer agents collaborate in a Slack-style UI to deliver results — powered by Claude, GPT-4o, Gemini, and more.

[한국어 README](#한국어)

---

## English

**AI Office 2** is an open-source, Slack-style AI agent team platform.  
Compose a team of specialized AI agents, give them a task, and watch them collaborate.

### Features

- **Multi-agent collaboration** — PM delegates to Researcher, Developer, Writer automatically
- **8 AI providers** — Claude, GPT, Gemini, Mistral, DeepSeek, OpenRouter, Ollama, and more
- **Obsidian Vault memory** — agents write results as Markdown for long-term memory
- **Budget management** — per-agent monthly USD caps with hard-stop
- **Approval gate** — require human approval before high-cost actions
- **Heartbeat engine** — real-time agent status monitoring
- **Electron desktop app** — runs locally, API keys stay on your machine

### Quick Start

```bash
git clone https://github.com/Dbaud1202/ai-office2.git
cd ai-office2
npm install
cp .env.example .env   # add your API keys
npm run dev            # web app
npm run electron:dev   # desktop app
```

### Tech Stack

React 19 · TypeScript · Electron 33 · Vite 6 · Tailwind CSS · Supabase (optional)

---

## 한국어

> **나만의 AI 에이전트 팀**을 구성하고, 복잡한 작업을 자연어로 위임하세요.  
> Slack 스타일 UI에서 PM·리서처·개발자·작가 에이전트가 협력하여 결과물을 만들어냅니다.

![Tech Stack](https://img.shields.io/badge/React_19-61DAFB?style=flat&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript_5-3178C6?style=flat&logo=typescript&logoColor=white)
![Electron](https://img.shields.io/badge/Electron_33-47848F?style=flat&logo=electron&logoColor=white)
![Vite](https://img.shields.io/badge/Vite_6-646CFF?style=flat&logo=vite&logoColor=white)

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| **에이전트 팀** | PM·리서처·개발자·작가 에이전트가 역할 분담하여 협력 |
| **멀티 프로바이더** | Claude, GPT, Gemini, Mistral 등 8개 프로바이더 지원 |
| **Obsidian Vault** | 에이전트 작업 결과를 마크다운으로 장기 기억 |
| **실행 타임라인** | 에이전트 간 위임 흐름을 실시간으로 시각화 |
| **예산 관리** | 에이전트별 월간 USD 한도 설정 및 하드스탑 |
| **승인 게이트** | 고비용 작업 실행 전 사용자 승인 요청 |
| **하트비트 엔진** | 에이전트 상태를 실시간으로 모니터링 |
| **Supabase 연동** | 클라우드 인증 및 메시지 동기화 (선택) |

---

## 스크린샷

> 개발 중 — 스크린샷 추가 예정

---

## 빠른 시작

### 1. 설치

```bash
git clone https://github.com/Dbaud1202/ai-office2.git
cd ai-office2
npm install
```

### 2. 환경변수 설정

```bash
cp .env.example .env
```

`.env` 파일을 열어 API 키를 입력합니다.  
API 키는 앱 내 **Settings → Providers** 화면에서도 설정할 수 있습니다.

### 3. 실행

```bash
# 웹 앱 (브라우저)
npm run dev

# 데스크탑 앱 (Electron)
npm run electron:dev

# 에이전트 CLI
npm run agent:start
```

---

## 에이전트 소개

| 에이전트 | 이름 | 역할 |
|---------|------|------|
| PM | 지우 | 작업 분석, 에이전트 위임, 사용자 소통 |
| 리서처 | 하늘 | 웹 검색, 정보 수집 및 분석 |
| 개발자 | 준 | 코드 작성, 아키텍처 설계 |
| 작가 | 소라 | 문서 작성, 콘텐츠 기획 |

PM(지우)에게 자연어로 작업을 요청하면, 나머지 에이전트에게 자동으로 위임합니다.

---

## 지원 AI 프로바이더

- **Anthropic Claude**
- **OpenAI GPT**
- **Google Gemini**
- **Mistral AI**
- **DeepSeek**
- **OpenRouter**
- **Ollama**
- 그 외 OpenAI 호환 엔드포인트

---

## 기술 스택

- **Frontend**: React 19, TypeScript, Tailwind CSS, React Router v7
- **Desktop**: Electron 33
- **Build**: Vite 6, esbuild
- **AI SDK**: `@anthropic-ai/sdk`, `openai`, `@google/generative-ai`
- **Memory**: Obsidian-호환 Markdown Vault (gray-matter)
- **Auth/Sync**: Supabase (선택적)
- **Test**: Vitest, happy-dom

---

## Vault 구조

에이전트 작업 결과는 `vault/` 폴더에 저장되며 Obsidian 앱으로 열람할 수 있습니다.

```
vault/
├── 프로젝트/       # 프로젝트별 위키
├── 작업/          # Task 노트 (진행중 / 완료)
├── 지식베이스/     # 리서처 수집 지식
├── 코드베이스/     # 개발자 산출물
├── 콘텐츠/        # 작가 산출물
├── 에이전트-로그/  # 에이전트별 실행 기록
└── 템플릿/        # 노트 생성 템플릿
```

---

## 환경변수

| 변수 | 설명 | 필수 |
|------|------|------|
| `ANTHROPIC_API_KEY` | Claude API 키 (CLI 에이전트용) | 선택 |
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL | 선택 |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon 키 | 선택 |

> 프로바이더 API 키는 앱 Settings 화면에서 입력하면 로컬에 안전하게 저장됩니다.

---

## 라이선스

MIT License

---

## 기여

이슈와 PR을 환영합니다. 버그 리포트, 기능 제안, 코드 기여 모두 감사합니다.
