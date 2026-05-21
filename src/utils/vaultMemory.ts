import type { Agent } from '../types/index.js';

interface SaveAgentMemoryParams {
  agent: Agent;
  userText: string;
  responseText: string;
  channelId: string;
}

interface MemorySearchResult {
  path: string;
  title: string;
  snippet: string;
  score: number;
}

function getElectronAPI() {
  return typeof window !== 'undefined' ? (window as any).electronAPI : null;
}

async function getVaultRoot(): Promise<string> {
  const api = getElectronAPI();
  if (api?.vaultRoot) {
    const result = await api.vaultRoot();
    if (result?.ok && result.data) return result.data;
  }
  return import.meta.env?.VITE_VAULT_ROOT ?? 'vault';
}

function pad(value: number) {
  return value.toString().padStart(2, '0');
}

function dateParts(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return {
    date: `${yyyy}-${mm}-${dd}`,
    month: `${yyyy}-${mm}`,
    datetime: `${yyyy}-${mm}-${dd} ${hh}:${min}`,
    iso: date.toISOString(),
  };
}

function sanitizeSegment(value: string) {
  return value
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48) || 'untitled';
}

function makeTaskSlug(userText: string) {
  return sanitizeSegment(userText).replace(/\s/g, '-').replace(/-+/g, '-');
}

function clip(text: string, max = 2000) {
  return text.length > max ? `${text.slice(0, max)}\n\n*(이하 생략)*` : text;
}

// 간단한 키워드 추출 (한국어 + 영어 공통)
const KO_STOPWORDS = new Set([
  '이', '그', '저', '것', '수', '있', '없', '하', '되', '안', '이다', '하다', '있다',
  '없다', '되다', '그리고', '하지만', '또한', '그러나', '때문에', '위해', '대한', '통해',
  '으로', '에서', '에게', '에는', '에도', '부터', '까지', '같이', '처럼', '보다', '만큼',
  '라고', '라면', '해서', '하면', '하고', '했다', '한다', '합니다', '됩니다', '합니다',
  '이런', '저런', '그런', '어떤', '모든', '각각', '전체', '일부', '많은', '적은',
]);

function extractKeywords(text: string, max = 12): string[] {
  const words = text
    .replace(/```[\s\S]*?```/g, '') // 코드 블록 제거
    .replace(/[^\w\s가-힣]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !KO_STOPWORDS.has(w) && !/^\d+$/.test(w));

  const freq = new Map<string, number>();
  for (const w of words) {
    const lower = w.toLowerCase();
    freq.set(lower, (freq.get(lower) ?? 0) + 1);
  }

  return [...freq.entries()]
    .filter(([, cnt]) => cnt >= 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([w]) => w);
}

// 응답에서 핵심 문장 3개 추출 (RAG 요약)
function extractKeySentences(text: string, max = 3): string[] {
  const clean = text.replace(/```[\s\S]*?```/g, '[코드]').replace(/#{1,3} /g, '');
  const sentences = clean
    .split(/[.!?。\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s.length < 200);

  // 길이 기준 상위 N개
  return sentences
    .sort((a, b) => b.length - a.length)
    .slice(0, max * 2)
    .slice(0, max);
}

async function readVaultFile(filePath: string): Promise<string> {
  const api = getElectronAPI();
  if (!api?.vaultRead) return '';
  const result = await api.vaultRead({ vaultRoot: await getVaultRoot(), filePath });
  return result?.ok ? result.data : '';
}

async function writeVaultFile(filePath: string, content: string): Promise<boolean> {
  const api = getElectronAPI();
  if (!api?.vaultWrite) return false;
  const result = await api.vaultWrite({ vaultRoot: await getVaultRoot(), filePath, content });
  return Boolean(result?.ok);
}

async function appendVaultFile(filePath: string, section: string): Promise<boolean> {
  const existing = await readVaultFile(filePath);
  const next = existing
    ? `${existing.trimEnd()}\n\n---\n\n${section.trim()}\n`
    : `${section.trim()}\n`;
  return writeVaultFile(filePath, next);
}

// ── 노트 생성기 ─────────────────────────────────────────────────────────────

function makeTaskNote(params: SaveAgentMemoryParams, taskPath: string): string {
  const { date, datetime, iso } = dateParts();
  const keywords = extractKeywords(`${params.userText} ${params.responseText}`);
  const keySentences = extractKeySentences(params.responseText);
  const summary = keySentences[0] ?? params.responseText.slice(0, 120);

  const tagsYaml = ['ai-office', 'task', params.agent.id, ...keywords.slice(0, 5)]
    .map((t) => `  - ${t}`)
    .join('\n');
  const keywordsYaml = keywords.map((k) => `  - "${k}"`).join('\n');

  return `---
title: "${sanitizeSegment(params.userText)}"
date: ${date}
createdAt: ${iso}
agent: ${params.agent.id}
agentName: ${params.agent.name}
channelId: ${params.channelId}
type: task
tags:
${tagsYaml}
keywords:
${keywordsYaml}
---

# ${sanitizeSegment(params.userText)}

> [!abstract] 요약
> ${summary}

## 📋 요청 내용

${params.userText}

## 🤖 ${params.agent.name} 응답

${clip(params.responseText, 3000)}

## 🔑 핵심 포인트

${keySentences.map((s) => `- ${s}`).join('\n') || '- (응답 참고)'}

## 🏷️ 키워드

${keywords.map((k) => `#${k}`).join('  ')}

## 🔗 연결

- [[위키/Home]]
- [[위키/에이전트/${params.agent.name}]]
- [[장기기억/${dateParts().month}]]
- [[에이전트-로그/${params.agent.id}/${date}]]

---
*${datetime} 자동 저장 | [[${taskPath.replace(/\.md$/, '')}]]*
`;
}

function makeLogSection(params: SaveAgentMemoryParams, taskPath: string): string {
  const { datetime } = dateParts();
  const keywords = extractKeywords(`${params.userText} ${params.responseText}`, 5);

  return `### ${datetime} — [[${taskPath.replace(/\.md$/, '')}]]

> **요청**: ${params.userText.slice(0, 120)}

**핵심 응답**:
${clip(params.responseText, 800)}

**키워드**: ${keywords.map((k) => `#${k}`).join('  ')}
`;
}

function makeMemorySection(params: SaveAgentMemoryParams, taskPath: string): string {
  const { datetime, iso } = dateParts();
  const keywords = extractKeywords(`${params.userText} ${params.responseText}`, 8);
  const keySentences = extractKeySentences(params.responseText, 3);

  return `### ${datetime} | ${params.agent.name} | [[${taskPath.replace(/\.md$/, '')}]]

**RAG 인덱스**:
- 요청: ${params.userText.slice(0, 200)}
- 에이전트: ${params.agent.name} (${params.agent.role})
- 날짜: ${iso}

**핵심 내용**:
${keySentences.map((s) => `- ${s}`).join('\n') || clip(params.responseText, 300)}

**검색 키워드**: ${keywords.join(', ')}
`;
}

// ── 위키 업데이트 ────────────────────────────────────────────────────────────

async function updateHomeWiki(params: SaveAgentMemoryParams, taskPath: string): Promise<boolean> {
  const { datetime } = dateParts();
  const keywords = extractKeywords(`${params.userText} ${params.responseText}`, 4);
  const entry = `| ${datetime} | [[위키/에이전트/${params.agent.name}\\|${params.agent.name}]] | [[${taskPath.replace(/\.md$/, '')}\\|${sanitizeSegment(params.userText)}]] | ${keywords.join(', ')} |`;

  const existing = await readVaultFile('위키/Home.md');
  if (!existing) {
    return writeVaultFile(
      '위키/Home.md',
      `# AI 오피스 위키

## 최근 작업 기록

| 날짜 | 에이전트 | 작업 | 키워드 |
|------|---------|------|--------|
${entry}

## 에이전트 목록

| 에이전트 | 역할 |
|---------|------|
| [[위키/에이전트/CTO]] | 기술 총괄 |
| [[위키/에이전트/CEO]] | 경영 총괄 |

`
    );
  }

  if (existing.includes(taskPath)) return true;

  const next = existing.includes('| 날짜 | 에이전트 | 작업 | 키워드 |')
    ? existing.replace(
        /(\| 날짜 \| 에이전트 \| 작업 \| 키워드 \|\n\|[-|]+\|\n)/,
        `$1${entry}\n`
      )
    : `${existing.trimEnd()}\n\n## 최근 작업 기록\n\n| 날짜 | 에이전트 | 작업 | 키워드 |\n|------|---------|------|--------|\n${entry}\n`;
  return writeVaultFile('위키/Home.md', next);
}

async function updateAgentWiki(params: SaveAgentMemoryParams, taskPath: string): Promise<boolean> {
  const filePath = `위키/에이전트/${params.agent.name}.md`;
  const { datetime } = dateParts();
  const keywords = extractKeywords(`${params.userText} ${params.responseText}`, 4);
  const entry = `| ${datetime} | [[${taskPath.replace(/\.md$/, '')}\\|${sanitizeSegment(params.userText)}]] | ${keywords.join(', ')} |`;

  const existing = await readVaultFile(filePath);
  if (!existing) {
    return writeVaultFile(
      filePath,
      `# ${params.agent.name}

- **역할**: ${params.agent.role}
- **Tier**: ${params.agent.tier}
- **에이전트 ID**: \`${params.agent.id}\`

## 작업 기록

| 날짜 | 작업 | 키워드 |
|------|------|--------|
${entry}

## 전문 분야

*작업이 쌓이면 자동으로 업데이트됩니다.*
`
    );
  }

  if (existing.includes(taskPath)) return true;

  const next = existing.includes('| 날짜 | 작업 | 키워드 |')
    ? existing.replace(
        /(\| 날짜 \| 작업 \| 키워드 \|\n\|[-|]+\|\n)/,
        `$1${entry}\n`
      )
    : `${existing.trimEnd()}\n\n## 작업 기록\n\n| 날짜 | 작업 | 키워드 |\n|------|------|--------|\n${entry}\n`;
  return writeVaultFile(filePath, next);
}

// ── 공개 API ─────────────────────────────────────────────────────────────────

export async function saveAgentMemoryToVault(params: SaveAgentMemoryParams): Promise<boolean> {
  if (!params.responseText.trim()) return false;
  if (!getElectronAPI()?.vaultWrite) return false;

  const { date, month } = dateParts();
  const slug = makeTaskSlug(params.userText);
  const taskPath = `작업/자동저장/${date}-${slug}.md`;
  const logPath = `에이전트-로그/${params.agent.id}/${date}.md`;
  const memoryPath = `장기기억/${month}.md`;

  await Promise.all([
    writeVaultFile(taskPath, makeTaskNote(params, taskPath)),
    appendVaultFile(logPath, makeLogSection(params, taskPath)),
    appendVaultFile(memoryPath, makeMemorySection(params, taskPath)),
    updateHomeWiki(params, taskPath),
    updateAgentWiki(params, taskPath),
  ]);

  return true;
}

// RAG: 관련 장기기억 로드 (쿼리와 관련도 높은 노트 상위 5개, 풍부한 컨텍스트 반환)
export async function loadRelatedVaultMemory(query: string): Promise<string> {
  const api = getElectronAPI();
  if (!api?.vaultSearch || !query.trim()) return '';

  const queryKeywords = extractKeywords(query, 6);
  const searchTerms = [query, ...queryKeywords].slice(0, 4);

  const seen = new Set<string>();
  const collected: MemorySearchResult[] = [];

  for (const term of searchTerms) {
    for (const folder of ['장기기억', '작업/자동저장']) {
      const result = await api.vaultSearch({ vaultRoot: await getVaultRoot(), query: term, folder });
      if (!result?.ok || !Array.isArray(result.data)) continue;
      for (const item of result.data as MemorySearchResult[]) {
        if (!seen.has(item.path)) {
          seen.add(item.path);
          collected.push(item);
        }
      }
    }
  }

  if (collected.length === 0) return '';

  // 점수 기준 정렬 후 상위 4개 선택
  const top = collected
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 4);

  const blocks = top.map((item) => {
    const noteName = item.path.replace(/\.md$/, '').split('/').pop() ?? item.title;
    return `### [[${item.path.replace(/\.md$/, '')}|${noteName}]]\n${item.snippet}`;
  });

  return blocks.join('\n\n');
}
