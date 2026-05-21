import Anthropic from '@anthropic-ai/sdk';
import type { ToolDefinition } from '../types/index.js';
import type { VaultAPI } from '../memory/vault.js';
import { ResearcherAgent } from '../agents/researcher.js';
import { DeveloperAgent } from '../agents/developer.js';
import { WriterAgent } from '../agents/writer.js';

export const agentToolDefinitions: ToolDefinition[] = [
  {
    name: 'delegate_to_researcher',
    description:
      '리서처 에이전트에게 조사 작업을 위임합니다. 시장 조사, 기술 트렌드, 경쟁 분석, 정보 수집이 필요할 때 사용합니다.',
    input_schema: {
      type: 'object',
      properties: {
        task_title: { type: 'string', description: '작업 제목' },
        instruction: {
          type: 'string',
          description: '리서처에게 전달할 구체적인 조사 지시사항',
        },
        context: {
          type: 'string',
          description: '관련 배경 정보 (선택사항)',
        },
        save_to_vault: {
          type: 'string',
          description:
            "결과를 저장할 vault 경로 (선택사항). 예: '지식베이스/트렌드/AI트렌드2026.md'",
        },
      },
      required: ['task_title', 'instruction'],
    },
  },
  {
    name: 'delegate_to_developer',
    description:
      '코드 개발자 에이전트에게 개발 작업을 위임합니다. 코드 작성, 리뷰, 아키텍처 설계, 디버깅이 필요할 때 사용합니다.',
    input_schema: {
      type: 'object',
      properties: {
        task_title: { type: 'string', description: '작업 제목' },
        instruction: {
          type: 'string',
          description: '개발자에게 전달할 구체적인 개발 지시사항',
        },
        context: {
          type: 'string',
          description: '관련 배경 정보, 기술 스택, 요구사항 등 (선택사항)',
        },
        save_to_vault: {
          type: 'string',
          description: '결과를 저장할 vault 경로 (선택사항)',
        },
      },
      required: ['task_title', 'instruction'],
    },
  },
  {
    name: 'delegate_to_writer',
    description:
      '콘텐츠 작가 에이전트에게 글쓰기 작업을 위임합니다. 블로그 포스트, 기획서, README, 문서화가 필요할 때 사용합니다.',
    input_schema: {
      type: 'object',
      properties: {
        task_title: { type: 'string', description: '작업 제목' },
        instruction: {
          type: 'string',
          description: '작가에게 전달할 구체적인 글쓰기 지시사항',
        },
        context: {
          type: 'string',
          description:
            '관련 배경 정보, 리서치 결과, 대상 독자 등 (선택사항)',
        },
        save_to_vault: {
          type: 'string',
          description: '결과를 저장할 vault 경로 (선택사항)',
        },
      },
      required: ['task_title', 'instruction'],
    },
  },
];

export function createAgentToolHandlers(
  client: Anthropic,
  vault: VaultAPI,
  onAgentChunk?: (agentName: string, text: string) => void
) {
  return {
    async delegate_to_researcher(input: {
      task_title: string;
      instruction: string;
      context?: string;
      save_to_vault?: string;
    }): Promise<string> {
      const agent = new ResearcherAgent(client, vault);
      const instruction = input.save_to_vault
        ? `${input.instruction}\n\n완료 후 vault의 '${input.save_to_vault}' 경로에 저장해주세요.`
        : input.instruction;

      const result = await agent.run(instruction, input.context, (text) => {
        onAgentChunk?.('리서처 하늘', text);
      });
      return result.output + (result.vaultPath ? `\n\n[저장 위치: ${result.vaultPath}]` : '');
    },

    async delegate_to_developer(input: {
      task_title: string;
      instruction: string;
      context?: string;
      save_to_vault?: string;
    }): Promise<string> {
      const agent = new DeveloperAgent(client, vault);
      const instruction = input.save_to_vault
        ? `${input.instruction}\n\n완료 후 vault의 '${input.save_to_vault}' 경로에 저장해주세요.`
        : input.instruction;

      const result = await agent.run(instruction, input.context, (text) => {
        onAgentChunk?.('개발자 준', text);
      });
      return result.output + (result.vaultPath ? `\n\n[저장 위치: ${result.vaultPath}]` : '');
    },

    async delegate_to_writer(input: {
      task_title: string;
      instruction: string;
      context?: string;
      save_to_vault?: string;
    }): Promise<string> {
      const agent = new WriterAgent(client, vault);
      const instruction = input.save_to_vault
        ? `${input.instruction}\n\n완료 후 vault의 '${input.save_to_vault}' 경로에 저장해주세요.`
        : input.instruction;

      const result = await agent.run(instruction, input.context, (text) => {
        onAgentChunk?.('작가 소라', text);
      });
      return result.output + (result.vaultPath ? `\n\n[저장 위치: ${result.vaultPath}]` : '');
    },
  };
}
