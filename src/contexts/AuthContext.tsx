import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import {
  getCurrentMonthMessageCount,
  getCurrentPlan,
  getInitialAuth,
  hasSupabaseConfig,
  PLAN_LIMITS,
  signIn as signInWithPassword,
  signOut as signOutSupabase,
  signUp as signUpWithPassword,
  supabase,
  type Plan,
} from '../utils/supabase.js';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  plan: Plan;
  messagesUsed: number;
  messageLimit: number;
  isConfigured: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshAccount: () => Promise<void>;
  noteUserMessageSent: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [plan, setPlan] = useState<Plan>('pro');
  const [messagesUsed, setMessagesUsed] = useState(0);
  const [isLoading, setIsLoading] = useState(hasSupabaseConfig);

  const refreshAccount = useCallback(async () => {
    if (!hasSupabaseConfig || !user) {
      setPlan('pro');
      setMessagesUsed(0);
      return;
    }

    const [nextPlan, count] = await Promise.all([
      getCurrentPlan(user.id),
      getCurrentMonthMessageCount(user.id),
    ]);
    setPlan(nextPlan);
    setMessagesUsed(count);
  }, [user]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!hasSupabaseConfig) {
        setIsLoading(false);
        return;
      }

      const snapshot = await getInitialAuth();
      if (!mounted) return;
      setUser(snapshot.user);
      setSession(snapshot.session);
      setIsLoading(false);
    }

    load();

    const subscription = supabase?.auth.onAuthStateChange((_, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
    }).data.subscription;

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    refreshAccount();
  }, [refreshAccount]);

  const signIn = useCallback(async (email: string, password: string) => {
    const data = await signInWithPassword(email, password);
    setUser(data.user);
    setSession(data.session);
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const data = await signUpWithPassword(email, password);
    setUser(data.user);
    setSession(data.session);
  }, []);

  const signOut = useCallback(async () => {
    await signOutSupabase();
    setUser(null);
    setSession(null);
    setPlan('pro');
    setMessagesUsed(0);
  }, []);

  const noteUserMessageSent = useCallback(() => {
    setMessagesUsed((prev) => prev + 1);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    session,
    plan,
    messagesUsed,
    messageLimit: PLAN_LIMITS[plan].messageLimit,
    isConfigured: hasSupabaseConfig,
    isLoading,
    signIn,
    signUp,
    signOut,
    refreshAccount,
    noteUserMessageSent,
  }), [
    user,
    session,
    plan,
    messagesUsed,
    isLoading,
    signIn,
    signUp,
    signOut,
    refreshAccount,
    noteUserMessageSent,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
