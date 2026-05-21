import React from 'react';
import { useToast } from '../../contexts/ToastContext.js';

const TYPE_STYLES = {
  success: 'bg-emerald-600 border-emerald-500',
  error:   'bg-red-700 border-red-500',
  warning: 'bg-yellow-600 border-yellow-500',
  info:    'bg-blue-700 border-blue-500',
};

const TYPE_ICONS = {
  success: '✅',
  error:   '❌',
  warning: '⚠️',
  info:    'ℹ️',
};

export default function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`
            flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg
            text-white text-sm font-medium max-w-sm pointer-events-auto
            animate-slide-in
            ${TYPE_STYLES[toast.type]}
          `}
        >
          <span className="text-base flex-shrink-0">{TYPE_ICONS[toast.type]}</span>
          <span className="flex-1">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-white/70 hover:text-white ml-1 flex-shrink-0 text-lg leading-none"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
