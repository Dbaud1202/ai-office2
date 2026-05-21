import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { VaultAPI } from '../agent-core/memory/vault.js';

let tmpDir: string;
let vault: VaultAPI;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-test-'));
  vault = new VaultAPI(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ── writeNote / readNote ───────────────────────────────────────────────────

describe('writeNote / readNote', () => {
  it('노트를 쓰고 읽으면 내용이 일치한다', async () => {
    await vault.writeNote('memo/hello.md', '# 안녕하세요\n내용입니다.');
    const note = await vault.readNote('memo/hello.md');

    expect(note).not.toBeNull();
    expect(note!.content).toContain('안녕하세요');
    expect(note!.title).toBe('hello');
    expect(note!.path).toBe('memo/hello.md');
  });

  it('frontmatter 옵션을 전달하면 저장된다', async () => {
    await vault.writeNote('notes/project.md', '프로젝트 노트', {
      title: 'AI오피스2',
      tags: ['ai', 'project'],
    });
    const note = await vault.readNote('notes/project.md');

    expect(note!.title).toBe('AI오피스2');
    expect(note!.tags).toEqual(['ai', 'project']);
  });

  it('중첩 디렉터리가 없어도 자동 생성된다', async () => {
    await expect(
      vault.writeNote('a/b/c/deep.md', '깊은 노트')
    ).resolves.not.toThrow();
    const note = await vault.readNote('a/b/c/deep.md');
    expect(note).not.toBeNull();
  });

  it('존재하지 않는 경로는 null을 반환한다', async () => {
    const note = await vault.readNote('nonexistent.md');
    expect(note).toBeNull();
  });
});

// ── appendToNote ──────────────────────────────────────────────────────────

describe('appendToNote', () => {
  it('기존 노트에 내용을 추가한다', async () => {
    await vault.writeNote('log.md', '첫 번째 줄');
    await vault.appendToNote('log.md', '두 번째 줄');
    const note = await vault.readNote('log.md');

    expect(note!.content).toContain('첫 번째 줄');
    expect(note!.content).toContain('두 번째 줄');
  });

  it('노트가 없으면 새로 생성한다', async () => {
    await vault.appendToNote('newfile.md', '처음 내용');
    const note = await vault.readNote('newfile.md');
    expect(note).not.toBeNull();
    expect(note!.content).toContain('처음 내용');
  });

  it('append 후 updatedAt이 갱신된다', async () => {
    await vault.writeNote('ts-test.md', '원본');
    const before = (await vault.readNote('ts-test.md'))!.updatedAt;

    // 1ms 차이를 보장하기 위해 Date.now()를 변경
    await new Promise((r) => setTimeout(r, 5));
    await vault.appendToNote('ts-test.md', '추가');

    const after = (await vault.readNote('ts-test.md'))!.updatedAt;
    expect(after > before).toBe(true);
  });
});

// ── listNotes ─────────────────────────────────────────────────────────────

describe('listNotes', () => {
  it('폴더 안의 .md 파일 목록을 반환한다', async () => {
    await vault.writeNote('folder/a.md', 'a');
    await vault.writeNote('folder/b.md', 'b');
    await vault.writeNote('folder/ignore.txt', 'txt'); // .md 아님

    const notes = await vault.listNotes('folder');
    const paths = notes.map((n) => n.path);

    expect(paths).toContain('folder/a.md');
    expect(paths).toContain('folder/b.md');
    expect(paths.some((p) => p.endsWith('.txt'))).toBe(false);
  });

  it('존재하지 않는 폴더는 빈 배열을 반환한다', async () => {
    const notes = await vault.listNotes('ghost-folder');
    expect(notes).toEqual([]);
  });

  it('하위 폴더까지 재귀 탐색한다', async () => {
    await vault.writeNote('root/sub/deep.md', '깊은 파일');
    const notes = await vault.listNotes('root');
    expect(notes.length).toBe(1);
    expect(notes[0].path).toBe('root/sub/deep.md');
  });
});

// ── searchNotes ───────────────────────────────────────────────────────────

describe('searchNotes', () => {
  beforeEach(async () => {
    await vault.writeNote('search/react.md', 'React는 프런트엔드 라이브러리입니다.', {
      title: 'React 소개',
    });
    await vault.writeNote('search/electron.md', 'Electron으로 데스크톱 앱을 만듭니다.', {
      title: 'Electron 가이드',
    });
    await vault.writeNote('search/unrelated.md', '관련 없는 내용입니다.', {
      title: '기타',
    });
  });

  it('키워드가 포함된 노트를 반환한다', async () => {
    const results = await vault.searchNotes('React');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].note.title).toBe('React 소개');
  });

  it('score가 높은 순서로 정렬된다', async () => {
    // 두 키워드 모두 포함된 노트가 더 높은 score
    await vault.writeNote('search/both.md', 'React와 Electron을 함께 사용합니다.');
    const results = await vault.searchNotes('React Electron');
    expect(results[0].score).toBeGreaterThanOrEqual(results[1]?.score ?? 0);
  });

  it('일치하는 노트가 없으면 빈 배열을 반환한다', async () => {
    const results = await vault.searchNotes('존재하지않는키워드xyz');
    expect(results).toEqual([]);
  });

  it('snippet은 키워드 주변 텍스트를 포함한다', async () => {
    const results = await vault.searchNotes('React');
    expect(results[0].snippet).toBeTruthy();
    expect(results[0].snippet.length).toBeGreaterThan(0);
  });
});

// ── noteExists ────────────────────────────────────────────────────────────

describe('noteExists', () => {
  it('존재하는 파일은 true를 반환한다', async () => {
    await vault.writeNote('check.md', '확인');
    expect(await vault.noteExists('check.md')).toBe(true);
  });

  it('존재하지 않는 파일은 false를 반환한다', async () => {
    expect(await vault.noteExists('ghost.md')).toBe(false);
  });
});

// ── sanitizePath ──────────────────────────────────────────────────────────

describe('sanitizePath', () => {
  it('Windows 금지 문자를 하이픈으로 치환한다', () => {
    expect(vault.sanitizePath('file<name>.md')).toBe('file-name-.md');
    expect(vault.sanitizePath('a/b:c')).toBe('a-b-c');
    expect(vault.sanitizePath('test?note')).toBe('test-note');
  });

  it('일반 파일명은 변경하지 않는다', () => {
    expect(vault.sanitizePath('normal-file_123.md')).toBe('normal-file_123.md');
  });
});

// ── getRecentNotes ────────────────────────────────────────────────────────

describe('getRecentNotes', () => {
  it('limit 개수만큼 반환하고 최신순으로 정렬된다', async () => {
    for (let i = 1; i <= 5; i++) {
      await vault.writeNote(`recent/note${i}.md`, `내용 ${i}`, {
        updatedAt: `2024-01-0${i}T00:00:00.000Z`,
      });
    }
    const recent = await vault.getRecentNotes(3);
    expect(recent.length).toBe(3);
    // 가장 최신(2024-01-05)이 첫 번째여야 함
    expect(recent[0].updatedAt >= recent[1].updatedAt).toBe(true);
  });
});
