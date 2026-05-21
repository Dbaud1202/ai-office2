import type { ToolDefinition, VaultNote } from '../types/index.js';
import type { VaultAPI } from '../memory/vault.js';

export const vaultToolDefinitions: ToolDefinition[] = [
  {
    name: 'vault_read_note',
    description:
      'Obsidian vault에서 특정 경로의 노트를 읽어옵니다. 이전 작업 결과, 프로젝트 정보, 지식 베이스를 확인할 때 사용합니다.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: "vault 내 상대 경로. 예: '프로젝트/마이앱/README.md'",
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'vault_search',
    description:
      'Obsidian vault 전체 또는 특정 폴더에서 키워드로 노트를 검색합니다. 관련 기존 작업이나 지식을 찾을 때 사용합니다.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '검색 키워드 또는 문장' },
        folder: {
          type: 'string',
          description:
            "검색 범위 폴더. 예: '지식베이스', '프로젝트'. 생략 시 전체 검색",
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'vault_write_note',
    description:
      'Obsidian vault에 새 노트를 생성하거나 기존 노트를 업데이트합니다. 작업 완료 후 결과물을 저장할 때 사용합니다.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            '저장할 vault 내 상대 경로. 폴더가 없으면 자동 생성됩니다.',
        },
        content: { type: 'string', description: '저장할 마크다운 내용' },
        tags: {
          type: 'string',
          description:
            "쉼표로 구분된 태그 목록. 예: '프로젝트, TypeScript, API'",
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'vault_append_note',
    description:
      '기존 노트의 끝에 내용을 추가합니다. 진행 로그, 결과 업데이트 시 사용합니다.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '추가할 vault 내 상대 경로' },
        content: { type: 'string', description: '추가할 마크다운 내용' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'vault_list_notes',
    description:
      'vault 내 특정 폴더의 노트 목록을 가져옵니다. 어떤 파일들이 있는지 파악할 때 사용합니다.',
    input_schema: {
      type: 'object',
      properties: {
        folder: {
          type: 'string',
          description:
            "조회할 폴더 경로. 예: '프로젝트', '지식베이스/기술'",
        },
      },
      required: ['folder'],
    },
  },
];

export function createVaultToolHandlers(vault: VaultAPI) {
  return {
    async vault_read_note(input: { path: string }): Promise<string> {
      const note = await vault.readNote(input.path);
      if (!note) return `노트를 찾을 수 없습니다: ${input.path}`;
      return `# ${note.title}\n\n${note.content}`;
    },

    async vault_search(input: {
      query: string;
      folder?: string;
    }): Promise<string> {
      const results = await vault.searchNotes(input.query, input.folder);
      if (results.length === 0)
        return `'${input.query}' 관련 노트가 없습니다.`;
      return results
        .map(
          (r) =>
            `[${r.note.path}] (점수: ${r.score})\n...${r.snippet}...`
        )
        .join('\n\n');
    },

    async vault_write_note(input: {
      path: string;
      content: string;
      tags?: string;
    }): Promise<string> {
      const tags = input.tags
        ? input.tags.split(',').map((t) => t.trim())
        : [];
      await vault.writeNote(input.path, input.content, { tags });
      return `노트 저장 완료: ${input.path}`;
    },

    async vault_append_note(input: {
      path: string;
      content: string;
    }): Promise<string> {
      await vault.appendToNote(input.path, input.content);
      return `노트 업데이트 완료: ${input.path}`;
    },

    async vault_list_notes(input: { folder: string }): Promise<string> {
      const notes = await vault.listNotes(input.folder);
      if (notes.length === 0)
        return `'${input.folder}' 폴더에 노트가 없습니다.`;
      return notes.map((n: VaultNote) => `- ${n.path} (${n.updatedAt})`).join('\n');
    },
  };
}
