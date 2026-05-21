import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext.js';
import { useToast } from '../../contexts/ToastContext.js';

export default function AuthModal() {
  const { signIn, signUp } = useAuth();
  const { addToast } = useToast();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || password.length < 6) {
      addToast('이메일과 6자 이상 비밀번호를 입력하세요.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'signin') await signIn(email.trim(), password);
      else await signUp(email.trim(), password);
      addToast(mode === 'signin' ? '로그인되었습니다.' : '가입이 완료되었습니다.', 'success');
    } catch (err: any) {
      addToast(err.message ?? '인증 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-xl border border-chat-border bg-[#222529] p-5 shadow-2xl">
        <h1 className="text-lg font-semibold text-white">AI 오피스 계정</h1>
        <p className="mt-1 text-xs text-sidebar-muted">
          구독 플랜과 클라우드 동기화를 사용하려면 로그인하세요.
        </p>

        <div className="mt-5 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs text-sidebar-muted">이메일</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="message-input w-full"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-sidebar-muted">비밀번호</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="message-input w-full"
              placeholder="6자 이상"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-5 w-full rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? '처리 중...' : mode === 'signin' ? '로그인' : '회원가입'}
        </button>

        <button
          type="button"
          onClick={() => setMode((prev) => (prev === 'signin' ? 'signup' : 'signin'))}
          className="mt-3 w-full text-center text-xs text-brand-primary hover:underline"
        >
          {mode === 'signin' ? '계정이 없나요? 회원가입' : '이미 계정이 있나요? 로그인'}
        </button>
      </form>
    </div>
  );
}
