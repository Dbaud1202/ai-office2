import type { TaskCheckout } from '../types/index.js';

const STORAGE_KEY = 'ao2-task-checkouts-v1';
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5분

function loadCheckouts(): TaskCheckout[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveCheckouts(items: TaskCheckout[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function purgeExpired(items: TaskCheckout[]): TaskCheckout[] {
  const now = Date.now();
  return items.filter((c) => new Date(c.expiresAt).getTime() > now);
}

export function checkoutTask(taskId: string, agentId: string, ttlMs = DEFAULT_TTL_MS): TaskCheckout | null {
  const checkouts = purgeExpired(loadCheckouts());
  const existing = checkouts.find((c) => c.taskId === taskId);
  if (existing) return null; // 이미 체크아웃됨

  const now = new Date();
  const checkout: TaskCheckout = {
    taskId,
    agentId,
    lockedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  };
  saveCheckouts([...checkouts, checkout]);
  return checkout;
}

export function releaseTask(taskId: string): void {
  const checkouts = purgeExpired(loadCheckouts()).filter((c) => c.taskId !== taskId);
  saveCheckouts(checkouts);
}

export function getActiveCheckouts(): TaskCheckout[] {
  const checkouts = purgeExpired(loadCheckouts());
  saveCheckouts(checkouts); // 만료된 항목 정리
  return checkouts;
}

export function getTaskCheckout(taskId: string): TaskCheckout | undefined {
  return getActiveCheckouts().find((c) => c.taskId === taskId);
}

export function isTaskCheckedOut(taskId: string): boolean {
  return Boolean(getTaskCheckout(taskId));
}
