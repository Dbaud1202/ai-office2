import readline from 'readline';
import chalk, { type ChalkInstance } from 'chalk';
import { Orchestrator } from '../orchestrator/index.js';

export async function startCLI(
  orchestrator: Orchestrator,
  vaultPath: string,
  onNewMessage: () => void
): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  console.log(chalk.cyan('╔══════════════════════════════════════════╗'));
  console.log(chalk.cyan('║      AI 오피스2 - 나만의 에이전트 팀     ║'));
  console.log(chalk.cyan('╚══════════════════════════════════════════╝'));
  console.log();
  console.log(
    chalk.blue.bold('[PM 지우]'),
    chalk.green.bold('[리서처 하늘]'),
    chalk.yellow.bold('[개발자 준]'),
    chalk.magenta.bold('[작가 소라]'),
    '대기 중'
  );
  console.log(chalk.gray(`Vault: ${vaultPath}`));
  console.log();
  console.log(
    chalk.gray('/quit') + ' 종료  ' +
    chalk.gray('/vault <경로>') + ' 노트 보기  ' +
    chalk.gray('/tasks') + ' 최근 작업'
  );
  console.log(chalk.gray('━'.repeat(44)));
  console.log();

  const vault = orchestrator.getVault();

  const askQuestion = (): void => {
    rl.question(chalk.white.bold('당신: '), async (input) => {
      const trimmed = input.trim();
      if (!trimmed) {
        askQuestion();
        return;
      }

      if (trimmed === '/quit' || trimmed === '/exit') {
        console.log(chalk.gray('\n에이전트 팀을 종료합니다. 수고하셨습니다!'));
        rl.close();
        process.exit(0);
      }

      if (trimmed.startsWith('/vault ')) {
        const notePath = trimmed.slice(7).trim();
        const note = await vault.readNote(notePath);
        if (!note) {
          console.log(chalk.red(`노트를 찾을 수 없습니다: ${notePath}`));
        } else {
          console.log(chalk.cyan(`\n── ${note.path} ──`));
          console.log(note.content);
          console.log(chalk.cyan('─'.repeat(40)));
        }
        console.log();
        askQuestion();
        return;
      }

      if (trimmed === '/tasks') {
        const recent = await vault.getRecentNotes(5, '작업');
        if (recent.length === 0) {
          console.log(chalk.gray('최근 작업이 없습니다.'));
        } else {
          console.log(chalk.cyan('\n최근 작업:'));
          for (const note of recent) {
            console.log(`  ${chalk.gray('·')} ${note.path} (${note.updatedAt.split('T')[0]})`);
          }
        }
        console.log();
        askQuestion();
        return;
      }

      console.log();
      // 새 메시지 시작 — 에이전트 표시 초기화
      onNewMessage();

      try {
        await orchestrator.processUserMessage(trimmed);
      } catch (err: unknown) {
        const error = err as { message?: string };
        console.log(chalk.red(`\n오류: ${error.message}`));
      }

      console.log('\n' + chalk.gray('━'.repeat(44)));
      console.log();
      askQuestion();
    });
  };

  askQuestion();
}
