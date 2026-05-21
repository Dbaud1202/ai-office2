import Anthropic from '@anthropic-ai/sdk';
import { PMAgent } from '../agents/pm.js';
import { CTOAgent } from '../agents/cto.js';
import { CMOAgent } from '../agents/cmo.js';
import { COOAgent } from '../agents/coo.js';
import { CPOAgent } from '../agents/cpo.js';
import { ResearcherAgent } from '../agents/researcher.js';
import { DeveloperAgent } from '../agents/developer.js';
import { WriterAgent } from '../agents/writer.js';
import { VaultAPI } from '../memory/vault.js';
import type { Session, ConversationTurn } from '../types/index.js';

// 채널 ID → 에이전트 이름 매핑
const AGENT_NAME_MAP: Record<string, string> = {
  pm: 'PM 지우',
  cto: 'CTO 지우',
  cmo: 'CMO 민',
  coo: 'COO 준영',
  cpo: 'CPO 루나',
  researcher: '리서처 하늘',
  developer: '개발자 준',
  writer: '작가 소라',
  analyst: '분석가 도윤',
};

type AgentInstance =
  | PMAgent
  | CTOAgent
  | CMOAgent
  | COOAgent
  | CPOAgent
  | ResearcherAgent
  | DeveloperAgent
  | WriterAgent;

export class Orchestrator {
  private client: Anthropic;
  private vault: VaultAPI;
  private session: Session;
  private agents: Map<string, AgentInstance> = new Map();
  private onChunk: (agentName: string, text: string) => void;

  constructor(
    apiKey: string,
    vaultRoot: string,
    onChunk: (agentName: string, text: string) => void
  ) {
    this.client = new Anthropic({ apiKey });
    this.vault = new VaultAPI(vaultRoot);
    this.onChunk = onChunk;

    this.session = {
      id: Date.now().toString(),
      startedAt: new Date().toISOString(),
      history: [],
      activeTasks: [],
    };

    // 에이전트 인스턴스 초기화
    const agentChunk = (agentName: string, text: string) => onChunk(agentName, text);
    this.agents.set('pm', new PMAgent(this.client, this.vault, agentChunk));
    this.agents.set('cto', new CTOAgent(this.client, this.vault, agentChunk));
    this.agents.set('cmo', new CMOAgent(this.client, this.vault, agentChunk));
    this.agents.set('coo', new COOAgent(this.client, this.vault, agentChunk));
    this.agents.set('cpo', new CPOAgent(this.client, this.vault, agentChunk));
    this.agents.set('researcher', new ResearcherAgent(this.client, this.vault));
    this.agents.set('developer', new DeveloperAgent(this.client, this.vault));
    this.agents.set('writer', new WriterAgent(this.client, this.vault));
  }

  async processUserMessage(userMessage: string, agentId = 'pm'): Promise<string> {
    const turn: ConversationTurn = {
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    };
    this.session.history.push(turn);

    // 해당 에이전트의 최근 대화 이력을 컨텍스트로 제공 (최대 6턴)
    const recentHistory = this.session.history.slice(-6);
    const historyContext =
      recentHistory.length > 1
        ? recentHistory
            .slice(0, -1)
            .map((t) => {
              const roleName = t.role === 'user' ? '사용자' : (AGENT_NAME_MAP[t.agentId ?? agentId] ?? agentId);
              return `[${roleName}]: ${t.content}`;
            })
            .join('\n')
        : undefined;

    const agent = this.agents.get(agentId) ?? this.agents.get('pm')!;
    const agentName = AGENT_NAME_MAP[agentId] ?? agentId;

    const result = await agent.run(userMessage, historyContext, (text) => {
      this.onChunk(agentName, text);
    });

    const assistantTurn: ConversationTurn = {
      role: 'assistant',
      content: result.output,
      agentId,
      timestamp: new Date().toISOString(),
    };
    this.session.history.push(assistantTurn);

    return result.output;
  }

  getVault(): VaultAPI {
    return this.vault;
  }

  getSession(): Session {
    return this.session;
  }

  getAgentNames(): string[] {
    return Array.from(this.agents.keys());
  }
}
