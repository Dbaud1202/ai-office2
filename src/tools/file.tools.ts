import fs from 'fs/promises';
import path from 'path';
import type { ToolDefinition } from '../types/index.js';

export const fileToolDefinitions: ToolDefinition[] = [
  {
    name: 'read_file',
    description:
      '로컬 파일 시스템에서 파일을 읽습니다. 코드 파일, 설정 파일 등을 확인할 때 사용합니다.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '읽을 파일의 절대 경로' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description:
      '로컬 파일 시스템에 파일을 저장합니다. 코드 개발자 에이전트가 실제 코드 파일을 생성할 때 사용합니다.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '저장할 파일의 절대 경로' },
        content: { type: 'string', description: '파일 내용' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_directory',
    description: '디렉토리 내 파일과 폴더 목록을 반환합니다.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '조회할 디렉토리의 절대 경로',
        },
      },
      required: ['path'],
    },
  },
];

export const fileToolHandlers = {
  async read_file(input: { path: string }): Promise<string> {
    try {
      const content = await fs.readFile(input.path, 'utf-8');
      const lines = content.split('\n');
      if (lines.length > 200) {
        return lines.slice(0, 200).join('\n') + `\n\n... (총 ${lines.length}줄, 200줄까지만 표시)`;
      }
      return content;
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code === 'ENOENT') return `파일을 찾을 수 없습니다: ${input.path}`;
      return `파일 읽기 오류: ${err.message}`;
    }
  },

  async write_file(input: { path: string; content: string }): Promise<string> {
    try {
      await fs.mkdir(path.dirname(input.path), { recursive: true });
      await fs.writeFile(input.path, input.content, 'utf-8');
      return `파일 저장 완료: ${input.path}`;
    } catch (e: unknown) {
      const err = e as { message?: string };
      return `파일 저장 오류: ${err.message}`;
    }
  },

  async list_directory(input: { path: string }): Promise<string> {
    try {
      const entries = await fs.readdir(input.path, { withFileTypes: true });
      const lines = entries.map((e) => {
        const icon = e.isDirectory() ? '📁' : '📄';
        return `${icon} ${e.name}`;
      });
      return lines.join('\n') || '(비어 있음)';
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code === 'ENOENT') return `디렉토리를 찾을 수 없습니다: ${input.path}`;
      return `오류: ${err.message}`;
    }
  },
};
