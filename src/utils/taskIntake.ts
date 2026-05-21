import type { Task } from '../types/index.js';
import { loadTasks, saveTasks, makeId } from './opsStore.js';

function now() {
  return new Date().toISOString();
}

function titleFromText(text: string) {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'AI follow-up task';
}

export function createTaskFromAgentWork(input: {
  source: 'meeting' | 'workroom' | 'pipeline';
  agentId?: string;
  goal: string;
  instruction?: string;
  priority?: Task['priority'];
}) {
  const task: Task = {
    id: makeId(),
    title: titleFromText(input.instruction || input.goal),
    description: [
      `Source: ${input.source}`,
      input.goal ? `Goal: ${input.goal}` : '',
      input.instruction ? `Instruction: ${input.instruction}` : '',
    ].filter(Boolean).join('\n'),
    status: 'todo',
    priority: input.priority ?? 'medium',
    assignedTo: input.agentId,
    createdAt: now(),
    updatedAt: now(),
    tags: ['ai-generated', input.source],
  };

  saveTasks([task, ...loadTasks()]);
  return task;
}
