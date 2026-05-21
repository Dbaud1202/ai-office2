import { useEffect, useRef } from 'react';
import { ALL_CHANNEL_ID, useChat } from '../../contexts/ChatContext.js';
import type { ScheduledJob } from '../../types/index.js';
import {
  KEYS,
  loadApprovals,
  loadDiscordConfig,
  loadFolderTriggers,
  loadTasks,
  loadWallet,
  loadWorkflows,
  makeId,
  notifyDiscord,
  readJson,
  saveDiscordConfig,
  saveFolderTriggers,
  saveTasks,
  writeJson,
} from '../../utils/opsStore.js';

async function listFolder(path: string): Promise<string[]> {
  const api = (window as any).electronAPI;
  if (!api?.computerTool) return [];
  const result = await api.computerTool({ name: 'computer_list_directory', input: { path } });
  if (!result?.ok) return [];
  return String(result.data ?? '').split('\n').filter(Boolean).map((line) => line.replace(/^\[(DIR|FILE)\]\s*/, '').trim());
}

export default function AutomationRunner() {
  const { sendMessage, runPipeline, isStreaming, isPipelineRunning } = useChat();
  const busyRef = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      if (busyRef.current || isStreaming || isPipelineRunning) return;
      busyRef.current = true;
      try {
        const wallet = loadWallet();
        if (wallet.balance > 0 && wallet.balance < wallet.lowBalanceThreshold) {
          await notifyDiscord(`💸 잔액 부족 경고: 현재 잔액 ${wallet.balance.toLocaleString('ko-KR')} ${wallet.currency}`);
        }

        const jobs = readJson<ScheduledJob[]>(KEYS.scheduledJobs, []);
        const dueJob = jobs.find((job) => job.status === 'scheduled' && new Date(job.runAt).getTime() <= Date.now());
        if (dueJob) {
          const workflows = loadWorkflows();
          if (dueJob.type === 'workflow') {
            const workflow = workflows.find((item) => item.id === dueJob.workflowId);
            if (workflow) await runPipeline(workflow.steps, dueJob.prompt || workflow.goal);
          } else {
            await sendMessage(dueJob.targetChannelId, dueJob.prompt || dueJob.title);
          }
          const nextJobs = jobs.map((job) => {
            if (job.id !== dueJob.id) return job;
            if (job.repeat === 'none') return { ...job, status: 'done' as const, lastRunAt: new Date().toISOString() };
            const date = new Date(job.runAt);
            date.setDate(date.getDate() + (job.repeat === 'weekly' ? 7 : 1));
            return { ...job, runAt: date.toISOString(), lastRunAt: new Date().toISOString() };
          });
          writeJson(KEYS.scheduledJobs, nextJobs);
          await notifyDiscord(`⏰ 예약 작업 실행: ${dueJob.title}`);
          busyRef.current = false;
          return;
        }

        const triggers = loadFolderTriggers();
        const workflows = loadWorkflows();
        let triggersChanged = false;
        for (const trigger of triggers.filter((item) => item.enabled)) {
          const entries = await listFolder(trigger.folderPath);
          const known = new Set(trigger.knownEntries);
          const fresh = entries.filter((entry) => !known.has(entry));
          trigger.knownEntries = entries;
          trigger.lastCheckedAt = new Date().toISOString();
          triggersChanged = true;
          if (fresh.length === 0) continue;
          const prompt = `${trigger.prompt}\n\n[새 파일/폴더]\n${fresh.join('\n')}`;
          if (trigger.workflowId) {
            const workflow = workflows.find((item) => item.id === trigger.workflowId);
            if (workflow) await runPipeline(workflow.steps, prompt);
          } else {
            await sendMessage(ALL_CHANNEL_ID, prompt);
          }
          await notifyDiscord(`📁 폴더 트리거 실행: ${trigger.name} (${fresh.length}개 발견)`);
          break;
        }
        if (triggersChanged) saveFolderTriggers(triggers);

        const config = loadDiscordConfig();
        const api = (window as any).electronAPI;
        if (config.enabled && config.botToken && config.channelId && api?.discordFetchMessages) {
          const result = await api.discordFetchMessages({ botToken: config.botToken, channelId: config.channelId, limit: 10, after: config.lastMessageId });
          if (result?.ok && Array.isArray(result.data)) {
            let lastMessageId = config.lastMessageId;
            for (const message of result.data.slice().reverse()) {
              lastMessageId = message.id;
              const content = String(message.content ?? '').trim();
              if (!content.startsWith('!ao')) continue;
              const command = content.replace(/^!ao\s*/, '');
              if (/^(상태|status)/.test(command)) {
                await notifyDiscord(`📊 상태: 할일 ${loadTasks().filter((task) => task.status !== 'done').length}개, 승인 대기 ${loadApprovals().filter((item) => item.status === 'pending').length}개`);
              } else if (command.startsWith('할일 ')) {
                const title = command.replace(/^할일\s*/, '').trim();
                if (title) {
                  saveTasks([{ id: makeId(), title, description: 'Discord 명령으로 추가됨', status: 'todo', priority: 'medium', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), tags: ['discord'] }, ...loadTasks()]);
                  await notifyDiscord(`✅ 할일 추가: ${title}`);
                }
              } else if (command.startsWith('명령 ')) {
                await sendMessage(ALL_CHANNEL_ID, command.replace(/^명령\s*/, ''));
              }
            }
            saveDiscordConfig({ ...config, lastMessageId });
          }
        }
      } finally {
        busyRef.current = false;
      }
    }, 45000);
    return () => window.clearInterval(timer);
  }, [sendMessage, runPipeline, isStreaming, isPipelineRunning]);

  return null;
}
