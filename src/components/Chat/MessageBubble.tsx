import React from 'react';
import type { ChatMessage } from '../../types/index.js';
import { useAgents } from '../../contexts/AgentContext.js';
import { useChat } from '../../contexts/ChatContext.js';
import AgentAvatar from '../UI/AgentAvatar.js';

interface Props {
  message: ChatMessage;
}

function TypingDots() {
  return (
    <span className="flex items-center gap-1 h-5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="typing-dot w-2 h-2 rounded-full bg-sidebar-muted"
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </span>
  );
}

function renderMarkdown(text: string) {
  // Basic markdown rendering
  const lines = text.split('\n');
  const result: React.ReactNode[] = [];
  let codeBlock = false;
  let codeLines: string[] = [];
  let codeLang = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) {
      if (!codeBlock) {
        codeBlock = true;
        codeLang = line.slice(3).trim();
        codeLines = [];
      } else {
        result.push(
          <pre key={i} className="my-2 max-w-full overflow-x-auto rounded-lg bg-[#0d0d0d] p-3 text-xs font-mono text-green-300">
            <code>{codeLines.join('\n')}</code>
          </pre>
        );
        codeBlock = false;
      }
      continue;
    }
    if (codeBlock) { codeLines.push(line); continue; }

    if (line.startsWith('### ')) {
      result.push(<h3 key={i} className="text-sm font-bold text-white mt-3 mb-1">{line.slice(4)}</h3>);
    } else if (line.startsWith('## ')) {
      result.push(<h2 key={i} className="text-base font-bold text-white mt-3 mb-1">{line.slice(3)}</h2>);
    } else if (line.startsWith('# ')) {
      result.push(<h1 key={i} className="text-lg font-bold text-white mt-3 mb-1">{line.slice(2)}</h1>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      result.push(
        <li key={i} className="ml-4 break-words text-sm text-sidebar-text [overflow-wrap:anywhere] list-disc">{inlineFormat(line.slice(2))}</li>
      );
    } else if (/^\d+\. /.test(line)) {
      result.push(
        <li key={i} className="ml-4 break-words text-sm text-sidebar-text [overflow-wrap:anywhere] list-decimal">{inlineFormat(line.replace(/^\d+\. /, ''))}</li>
      );
    } else if (line.startsWith('> ')) {
      result.push(
        <blockquote key={i} className="my-1 break-words border-l-2 border-brand-primary pl-3 text-sm italic text-sidebar-muted [overflow-wrap:anywhere]">
          {inlineFormat(line.slice(2))}
        </blockquote>
      );
    } else if (line === '') {
      result.push(<div key={i} className="h-2" />);
    } else {
      result.push(<p key={i} className="break-words text-sm leading-relaxed text-sidebar-text [overflow-wrap:anywhere]">{inlineFormat(line)}</p>);
    }
  }
  return result;
}

function inlineFormat(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let match;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const m = match[0];
    if (m.startsWith('`')) {
      parts.push(<code key={key++} className="rounded bg-[#0d0d0d] px-1 text-xs font-mono text-green-300 break-words [overflow-wrap:anywhere]">{m.slice(1, -1)}</code>);
    } else if (m.startsWith('**')) {
      parts.push(<strong key={key++} className="text-white font-semibold">{m.slice(2, -2)}</strong>);
    } else {
      parts.push(<em key={key++} className="text-sidebar-text italic">{m.slice(1, -1)}</em>);
    }
    last = match.index + m.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

export default function MessageBubble({ message }: Props) {
  const { getAgent } = useAgents();
  const { rerunMessage, revertToMessage, isChannelStreaming } = useChat();
  const agent = message.agentId ? getAgent(message.agentId) : undefined;
  const isThisChannelStreaming = isChannelStreaming(message.channelId);

  const time = new Date(message.timestamp).toLocaleTimeString('ko-KR', {
    hour: '2-digit', minute: '2-digit',
  });

  if (message.role === 'system') {
    return (
      <div className="flex justify-center py-1">
        <span className="text-xs text-sidebar-muted bg-sidebar-hover px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  function RevertButton() {
    return (
      <button
        onClick={() => {
          if (window.confirm('이 메시지 이후 내용을 모두 삭제하고 여기로 돌아갈까요?')) {
            revertToMessage(message.channelId, message.id);
          }
        }}
        disabled={isThisChannelStreaming}
        className="text-xs text-sidebar-muted hover:text-yellow-400 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30"
        title="여기로 돌아가기"
      >
        ↩ 여기로
      </button>
    );
  }

  if (message.role === 'user') {
    return (
      <div className="message-enter flex items-start gap-3 px-4 py-2 hover:bg-sidebar-hover/30 group">
        <div className="agent-avatar bg-brand-primary text-white flex-shrink-0 mt-0.5">
          나
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-sm font-semibold text-white">나</span>
            <span className="text-xs text-sidebar-muted">{time}</span>
            <button
              onClick={() => rerunMessage(message.id, message.channelId)}
              disabled={isThisChannelStreaming}
              className="ml-1 text-xs text-sidebar-muted hover:text-brand-primary opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30"
              title="다시 실행"
            >
              ↺ 재실행
            </button>
            <RevertButton />
          </div>
          <p className="whitespace-pre-wrap break-words text-sm text-sidebar-text [overflow-wrap:anywhere]">{message.content}</p>
        </div>
      </div>
    );
  }

  // Agent message
  return (
    <div className="message-enter flex items-start gap-3 px-4 py-2 hover:bg-sidebar-hover/30 group">
      <AgentAvatar agent={agent} className="agent-avatar mt-0.5" fallback="🤖" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-sm font-semibold text-white">{agent?.name ?? 'AI'}</span>
          {agent && (
            <span className={agent.tier === 'commander' ? 'badge-commander' : 'badge-worker'}>
              {agent.tier === 'commander' ? 'Commander' : 'Worker'}
            </span>
          )}
          <span className="text-xs text-sidebar-muted">{time}</span>
          <RevertButton />
        </div>
        <div className="prose-sm min-w-0 space-y-0.5">
          {message.isStreaming && !message.content ? (
            <TypingDots />
          ) : (
            renderMarkdown(message.content)
          )}
        </div>
      </div>
    </div>
  );
}
