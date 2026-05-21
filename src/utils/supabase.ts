import { createClient, type Session, type User } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = hasSupabaseConfig
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

export type Plan = 'free' | 'pro' | 'team';

export const PLAN_LIMITS: Record<Plan, {
  commanderSlots: number;
  workerSlots: number;
  messageLimit: number;
  label: string;
  price: string;
  features: string[];
}> = {
  free: {
    commanderSlots: 1,
    workerSlots: 2,
    messageLimit: 50,
    label: 'Free',
    price: '무료',
    features: ['Commander 1명', 'Worker 2명', '월 50회 AI 요청', 'Vault 기본 기능'],
  },
  pro: {
    commanderSlots: 4,
    workerSlots: 4,
    messageLimit: -1,
    label: 'Pro',
    price: '구독제',
    features: ['Commander 4명', 'Worker 4명', '무제한 AI 요청', 'Obsidian Vault', '우선 지원'],
  },
  team: {
    commanderSlots: 4,
    workerSlots: 4,
    messageLimit: -1,
    label: 'Team',
    price: '팀 구독제',
    features: ['Pro 모든 기능', '팀 공유 채널', '관리자 대시보드', '우선 지원 및 전담 CS'],
  },
};

export interface AuthSnapshot {
  user: User | null;
  session: Session | null;
}

export async function getInitialAuth(): Promise<AuthSnapshot> {
  if (!supabase) return { user: null, session: null };
  const { data } = await supabase.auth.getSession();
  return {
    user: data.session?.user ?? null,
    session: data.session ?? null,
  };
}

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error('Supabase 환경변수가 설정되어 있지 않습니다.');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email: string, password: string) {
  if (!supabase) throw new Error('Supabase 환경변수가 설정되어 있지 않습니다.');
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentPlan(userId?: string): Promise<Plan> {
  if (!supabase || !userId) return hasSupabaseConfig ? 'free' : 'pro';

  const { data, error } = await supabase
    .from('subscriptions')
    .select('plan, expires_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return 'free';
  if (data.expires_at && new Date(data.expires_at) < new Date()) return 'free';
  return (data.plan as Plan) ?? 'free';
}

export async function getCurrentMonthMessageCount(userId?: string): Promise<number> {
  if (!supabase || !userId) return 0;
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('role', 'user')
    .gte('timestamp', start.toISOString());

  if (error) return 0;
  return count ?? 0;
}
