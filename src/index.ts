import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk, { type ChalkInstance } from 'chalk';
import { Orchestrator } from './orchestrator/index.js';
import { startCLI } from './cli/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VAULT_ROOT = path.resolve(__dirname, '..', 'vault');

const AGENT_COLORS: Record<string, ChalkInstance> = {
  'PM 지우': chalk.blue,
  '리서처 하늘': chalk.green,
  '개발자 준': chalk.yellow,
  '작가 소라': chalk.magenta,
};

let currentAgent = '';

function resetCurrentAgent(): void {
  currentAgent = '';
}

function onChunk(agentName: string, text: string): void {
  if (agentName !== currentAgent) {
    if (currentAgent) process.stdout.write('\n');
    currentAgent = agentName;
    const colorFn = AGENT_COLORS[agentName] ?? chalk.white;
    process.stdout.write(colorFn.bold(`[${agentName}] `));
  }
  process.stdout.write(text);
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error(chalk.red('오류: ANTHROPIC_API_KEY가 설정되지 않았습니다.'));
  console.error(chalk.gray('.env 파일에 ANTHROPIC_API_KEY=sk-ant-... 를 입력하세요.'));
  process.exit(1);
}

const orchestrator = new Orchestrator(apiKey, VAULT_ROOT, onChunk);

await startCLI(orchestrator, VAULT_ROOT, resetCurrentAgent);
