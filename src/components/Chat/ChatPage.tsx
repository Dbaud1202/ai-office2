import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ALL_CHANNEL_ID, MEETING_CHANNEL_ID, WORK_CHANNEL_ID, useChat } from '../../contexts/ChatContext.js';
import { useAgents } from '../../contexts/AgentContext.js';
import MessageBubble from './MessageBubble.js';
import AgentAvatar from '../UI/AgentAvatar.js';
import { speak, stopSpeech, KOREAN_VOICES } from '../../utils/edgeTTS.js';

interface ArchivedConversation {
  id: string;
  label: string;
  archivedAt: string;
  messages: Record<string, { role: string; agentId?: string; content: string; timestamp: string }[]>;
}

const ARCHIVE_KEY = 'ao2-message-archive-v1';

function loadArchives(): ArchivedConversation[] {
  try {
    return JSON.parse(localStorage.getItem(ARCHIVE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export default function ChatPage() {
  const {
    channels,
    messages,
    activeChannelId,
    sendMessage,
    isStreaming,
    isChannelStreaming,
    stopStreaming,
    forceStopChannel,
    startNewConversation,
    clearChannelMessages,
    clearAllMessages,
  } = useChat();
  const { getAgent } = useAgents();
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<{ name: string; content: string }[]>([]);
  const [archivesOpen, setArchivesOpen] = useState(false);
  const [archives, setArchives] = useState<ArchivedConversation[]>([]);
  const [selectedArchiveId, setSelectedArchiveId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceReplyEnabled, setVoiceReplyEnabled] = useState(() => localStorage.getItem('ao2-voice-reply') === 'true');
  const [ttsVoice, setTtsVoice] = useState(() => localStorage.getItem('ao2-tts-voice') ?? 'ko-KR-SunHiNeural');
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const voiceTranscriptRef = useRef('');
  const spokenMessageIdsRef = useRef<Set<string>>(new Set());

  const channel = channels.find((c) => c.id === activeChannelId);
  const isAllChannel = activeChannelId === ALL_CHANNEL_ID;
  const isMeetingChannel = activeChannelId === MEETING_CHANNEL_ID;
  const isWorkChannel = activeChannelId === WORK_CHANNEL_ID;
  const isSpecialChannel = isAllChannel || isMeetingChannel || isWorkChannel;
  const agent = channel && !isSpecialChannel ? getAgent(channel.agentId) : undefined;
  const msgs = messages[activeChannelId] ?? [];
  const isCurrentChannelStreaming = isChannelStreaming(activeChannelId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs.length, isCurrentChannelStreaming]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop?.();
      stopSpeech();
    };
  }, []);

  useEffect(() => {
    const spoken = spokenMessageIdsRef.current;
    if (spoken.size === 0) {
      for (const message of msgs) spoken.add(message.id);
      return;
    }

    if (!voiceReplyEnabled) return;
    const last = msgs[msgs.length - 1];
    if (!last || last.role !== 'agent' || last.isStreaming || !last.content.trim() || spoken.has(last.id)) return;

    spoken.add(last.id);
    void speak(last.content);
  }, [msgs, voiceReplyEnabled]);

  useEffect(() => {
    localStorage.setItem('ao2-voice-reply', String(voiceReplyEnabled));
    if (!voiceReplyEnabled) stopSpeech();
  }, [voiceReplyEnabled]);

  const openArchives = useCallback(() => {
    const next = loadArchives();
    setArchives(next);
    setSelectedArchiveId(next[0]?.id ?? null);
    setArchivesOpen(true);
  }, []);

  const sendVoiceCommand = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isCurrentChannelStreaming) return;
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    await sendMessage(activeChannelId, trimmed);
  }, [activeChannelId, isCurrentChannelStreaming, sendMessage]);

  const toggleVoiceInput = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('이 환경에서는 음성 인식을 사용할 수 없습니다. Chrome 또는 Electron 최신 환경에서 다시 시도해주세요.');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop?.();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    voiceTranscriptRef.current = '';
    recognition.lang = 'ko-KR';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event: any) => {
      let finalText = '';
      let interimText = '';
      for (const result of Array.from(event.results) as any[]) {
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) finalText += text;
        else interimText += text;
      }
      if (finalText.trim()) voiceTranscriptRef.current = `${voiceTranscriptRef.current} ${finalText}`.trim();
      setInput([voiceTranscriptRef.current, interimText].filter(Boolean).join(' ').trim());
    };
    recognition.onend = () => {
      setIsListening(false);
      const transcript = voiceTranscriptRef.current.trim();
      voiceTranscriptRef.current = '';
      if (transcript) void sendVoiceCommand(transcript);
    };
    recognition.onerror = () => setIsListening(false);
    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  }, [isListening, sendVoiceCommand]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || isCurrentChannelStreaming) return;
    const attachmentText = attachments
      .map((file) => `\n\n[첨부 파일: ${file.name}]\n${file.content.slice(0, 12000)}`)
      .join('');
    const finalText = `${text || '첨부 파일을 검토해줘.'}${attachmentText}`;
    setInput('');
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    await sendMessage(activeChannelId, finalText);
  }, [input, attachments, isCurrentChannelStreaming, activeChannelId, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  };

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const next = await Promise.all(
      Array.from(files).slice(0, 8).map(async (file) => {
        try {
          const content = await file.text();
          return { name: file.name, content };
        } catch {
          return { name: file.name, content: '[이 파일은 텍스트로 읽을 수 없습니다.]' };
        }
      })
    );
    setAttachments((prev) => [...prev, ...next]);
  }

  if (!channel || (!agent && !isSpecialChannel)) {
    return (
      <div className="flex-1 flex items-center justify-center text-sidebar-muted">
        채널을 선택해주세요.
      </div>
    );
  }

  const title = isAllChannel ? '전체 대화' : isMeetingChannel ? '회의 대화' : isWorkChannel ? '일 대화' : agent!.name;
  const description = isAllChannel
    ? '명령이나 할 일을 던지면 회의 대화에서 논의한 뒤 일 대화로 넘깁니다.'
    : isMeetingChannel
      ? 'CEO와 임원들이 요청을 검토하고 워커에게 넘길 일을 정합니다.'
      : isWorkChannel
        ? '회의에서 넘어온 실행 업무와 워커들의 결과를 모아봅니다.'
        : agent!.description;
  const icon = isAllChannel ? '#' : isMeetingChannel ? '💬' : isWorkChannel ? '✅' : agent!.emoji;
  const iconBg = isAllChannel ? 'bg-brand-primary' : isMeetingChannel ? 'bg-amber-600' : isWorkChannel ? 'bg-emerald-600' : agent!.color;
  const selectedArchive = archives.find((archive) => archive.id === selectedArchiveId) ?? archives[0];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="drag-region h-10 flex items-center gap-3 px-5 pr-40 border-b border-chat-border flex-shrink-0 bg-chat-bg">
        <div className="no-drag flex items-center gap-3 flex-1 min-w-0">
          {isSpecialChannel ? (
            <span className="text-xl">{icon}</span>
          ) : (
            <AgentAvatar agent={agent} className="h-6 w-6 rounded-md flex items-center justify-center text-base object-cover flex-shrink-0" />
          )}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-white truncate">{title}</h2>
          </div>
          {isSpecialChannel ? (
            <span className="badge-commander">{isWorkChannel ? 'Work' : isMeetingChannel ? 'Meeting' : 'Route'}</span>
          ) : (
            <span className={agent!.tier === 'commander' ? 'badge-commander' : 'badge-worker'}>
              {agent!.tier === 'commander' ? 'Commander' : 'Worker'}
            </span>
          )}
          <p className="text-xs text-sidebar-muted truncate hidden md:block">{description}</p>
        </div>

        {!isSpecialChannel && (
          <div className="no-drag flex items-center gap-2 flex-shrink-0">
            <span
              className={`flex items-center gap-1.5 text-xs ${
                agent!.status === 'working' ? 'text-yellow-400' : 'text-emerald-400'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  agent!.status === 'working' ? 'bg-yellow-400 animate-pulse' : 'bg-emerald-400'
                }`}
              />
              {agent!.status === 'working' ? '작업 중...' : '대기 중'}
            </span>
          </div>
        )}
        <div className="no-drag flex items-center gap-1 flex-shrink-0">
          {isCurrentChannelStreaming && (
            <>
              <button
                onClick={() => stopStreaming(activeChannelId)}
                className="rounded bg-red-500/20 px-2 py-1 text-xs text-red-300 hover:bg-red-500/30 animate-pulse"
                title="현재 대화 응답 생성 중지"
              >
                ⏹ 멈춤
              </button>
              <button
                onClick={() => forceStopChannel(activeChannelId)}
                className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-500"
                title="현재 대화 작업 강제 중단"
              >
                강제 스탑
              </button>
            </>
          )}
          <button
            onClick={() => startNewConversation(activeChannelId)}
            disabled={isCurrentChannelStreaming}
            className="rounded bg-sidebar-hover px-2 py-1 text-xs text-sidebar-text hover:text-white disabled:opacity-40"
            title="현재 채널을 아카이브하고 새 대화를 시작"
          >
            새 대화
          </button>
          <button
            onClick={openArchives}
            className="rounded bg-brand-primary px-2 py-1 text-xs text-white hover:bg-blue-700"
            title="로컬 아카이브에 보관된 정리된 대화 보기"
          >
            아카이브 보기
          </button>
          <button
            onClick={() => {
              if (window.confirm('현재 채널의 대화를 정리할까요? 이전 내용은 로컬 아카이브에 보관됩니다.')) {
                clearChannelMessages(activeChannelId);
              }
            }}
            disabled={isCurrentChannelStreaming || msgs.length === 0}
            className="rounded bg-sidebar-hover px-2 py-1 text-xs text-sidebar-text hover:text-white disabled:opacity-40"
          >
            정리
          </button>
          <button
            onClick={() => {
              const electronAPI = (window as any).electronAPI;
              if (electronAPI?.openVaultSubfolder) {
                electronAPI.openVaultSubfolder('작업/정리된대화');
              } else {
                alert('Electron 환경에서만 폴더를 열 수 있습니다.');
              }
            }}
            className="rounded bg-sidebar-hover px-2 py-1 text-xs text-sidebar-text hover:text-white"
            title="정리된 대화가 저장된 Vault 폴더 열기"
          >
            📂 정리된 대화
          </button>
          <button
            onClick={() => {
              if (window.confirm('모든 채널의 대화를 정리할까요? 이전 내용은 로컬 아카이브에 보관됩니다.')) {
                clearAllMessages();
              }
            }}
            disabled={isStreaming}
            className="rounded bg-red-500/10 px-2 py-1 text-xs text-red-300 hover:bg-red-500/20 disabled:opacity-40"
          >
            전체 정리
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto py-4 min-h-0">
        {msgs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
            {isSpecialChannel ? (
              <div className={`w-16 h-16 ${iconBg} rounded-2xl flex items-center justify-center text-4xl`}>
                {icon}
              </div>
            ) : (
              <AgentAvatar agent={agent} className="h-16 w-16 rounded-2xl flex items-center justify-center text-4xl object-cover" />
            )}
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">{title}</h3>
              <p className="text-sm text-sidebar-muted max-w-sm">{description}</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {getSuggestedPrompts(isAllChannel ? 'all' : isMeetingChannel ? 'meeting' : isWorkChannel ? 'work' : agent!.id).map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(activeChannelId, prompt)}
                  className="px-3 py-1.5 bg-sidebar-hover rounded-lg text-xs text-sidebar-text hover:bg-[#2f3136] hover:text-white transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          msgs.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        )}
        <div ref={bottomRef} />
      </div>

      <div className="px-4 pb-4 flex-shrink-0">
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((file, index) => (
              <span key={`${file.name}-${index}`} className="inline-flex max-w-xs items-center gap-2 rounded-lg bg-sidebar-hover px-2 py-1 text-xs text-sidebar-text">
                <span className="truncate">📎 {file.name}</span>
                <button
                  onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== index))}
                  className="text-sidebar-muted hover:text-red-300"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="bg-chat-input border border-chat-border rounded-xl p-2 flex items-end gap-2">
          <label className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-sidebar-muted hover:bg-sidebar-hover hover:text-white" title="파일 첨부">
            📎
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                handleFiles(event.target.files);
                event.currentTarget.value = '';
              }}
            />
          </label>
          <button
            onClick={toggleVoiceInput}
            disabled={isCurrentChannelStreaming}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:opacity-40 ${
              isListening
                ? 'bg-red-500/20 text-red-300 animate-pulse'
                : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-white'
            }`}
            title={isListening ? '음성 입력 중지' : '음성으로 말하기'}
          >
            {isListening ? '■' : '🎙'}
          </button>
          <div className="relative flex items-center">
            <button
              onClick={() => setVoiceReplyEnabled((value) => !value)}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                voiceReplyEnabled
                  ? 'bg-brand-primary text-white hover:bg-blue-700'
                  : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-white'
              }`}
              title={voiceReplyEnabled ? '음성 답변 끄기' : '음성 답변 켜기'}
            >
              🔊
            </button>
            <button
              onClick={() => setShowVoiceMenu((v) => !v)}
              className="flex h-6 w-4 items-center justify-center text-sidebar-muted hover:text-white text-xs"
              title="음성 선택"
            >
              ▾
            </button>
            {showVoiceMenu && (
              <div className="absolute bottom-10 left-0 z-50 w-56 rounded-lg border border-chat-border bg-[#2b2d31] shadow-xl p-1">
                <p className="px-2 py-1 text-xs text-sidebar-muted font-semibold">음성 선택 (Edge Neural TTS)</p>
                {KOREAN_VOICES.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => {
                      setTtsVoice(v.id);
                      localStorage.setItem('ao2-tts-voice', v.id);
                      setShowVoiceMenu(false);
                    }}
                    className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-sidebar-hover transition-colors ${
                      ttsVoice === v.id ? 'text-brand-primary font-semibold' : 'text-sidebar-text'
                    }`}
                  >
                    {v.gender === 'Female' ? '👩' : '👨'} {v.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={isAllChannel ? '명령이나 할 일을 적으면 회의 후 일 대화로 넘깁니다...' : isMeetingChannel ? '회의 안건을 보내기...' : isWorkChannel ? '워커들에게 바로 업무 지시하기...' : `${agent!.name}에게 메시지 보내기...`}
            rows={1}
            disabled={isCurrentChannelStreaming}
            className="flex-1 bg-transparent text-sm text-white placeholder-sidebar-muted resize-none focus:outline-none max-h-40 leading-relaxed py-1 px-2"
          />
          <button
            onClick={handleSend}
            disabled={(!input.trim() && attachments.length === 0) || isCurrentChannelStreaming}
            className="w-8 h-8 rounded-lg bg-brand-primary flex items-center justify-center flex-shrink-0 hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="전송"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 7L13 7M13 7L8 2M13 7L8 12" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-sidebar-muted mt-1 px-1">
          Enter로 전송, Shift+Enter로 줄바꿈 · 🎙 말하면 바로 전송 · 🔊 음성 답변 · 파일은 최대 8개까지 첨부
        </p>
      </div>
      {archivesOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-chat-border bg-[#222529] shadow-2xl">
            <div className="flex flex-shrink-0 items-center justify-between border-b border-chat-border px-4 py-3">
              <h3 className="text-sm font-semibold text-white">정리된 대화 보기</h3>
              <button onClick={() => setArchivesOpen(false)} className="rounded bg-sidebar-hover px-2 py-1 text-xs text-sidebar-text hover:text-white">
                닫기
              </button>
            </div>
            <div className="grid h-[70vh] min-h-0 grid-cols-[260px_minmax(0,1fr)] overflow-hidden">
              <aside className="min-h-0 overflow-y-auto border-r border-chat-border p-2">
                {archives.length === 0 ? (
                  <p className="p-3 text-xs text-sidebar-muted">아직 정리된 대화가 없습니다.</p>
                ) : (
                  archives.map((archive) => (
                    <button
                      key={archive.id}
                      onClick={() => setSelectedArchiveId(archive.id)}
                      className={`w-full rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                        selectedArchive?.id === archive.id
                          ? 'bg-brand-primary text-white'
                          : 'text-sidebar-text hover:bg-sidebar-hover'
                      }`}
                    >
                      <span className="block truncate font-medium">{archive.label}</span>
                      <span className="block truncate opacity-70">{new Date(archive.archivedAt).toLocaleString('ko-KR')}</span>
                    </button>
                  ))
                )}
              </aside>
              <section className="min-h-0 min-w-0 overflow-y-auto overflow-x-hidden p-4">
                {selectedArchive ? (
                  <div className="min-w-0 space-y-5">
                    {Object.entries(selectedArchive.messages).map(([channelId, archivedMessages]) => (
                      <div key={channelId} className="min-w-0">
                        <h4 className="mb-2 text-xs font-semibold text-sidebar-muted">{channelId}</h4>
                        <div className="space-y-2">
                          {archivedMessages.map((message, index) => (
                            <div key={`${channelId}-${index}`} className="min-w-0 rounded-lg bg-chat-bg p-3">
                              <div className="mb-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-sidebar-muted">
                                <span className="break-words font-semibold text-white">
                                  {message.role === 'user' ? '나' : message.agentId ?? message.role}
                                </span>
                                <span>{new Date(message.timestamp).toLocaleString('ko-KR')}</span>
                              </div>
                              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-sidebar-text [overflow-wrap:anywhere]">{message.content}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-sidebar-muted">왼쪽에서 대화를 선택하세요.</div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getSuggestedPrompts(agentId: string): string[] {
  const map: Record<string, string[]> = {
    all: ['이 할 일을 회의 후 워커들에게 넘겨줘', '이 목표를 논의하고 실행까지 맡겨줘', '대충 방향 잡고 바로 일 시켜줘'],
    meeting: ['이 안건 회의하고 담당 워커 정해줘', '리스크 보고 실행 순서 정해줘', '누가 맡을지 결정해줘'],
    work: ['이 업무 바로 실행해줘', '조사하고 결과물까지 정리해줘', '개발/문서 작업으로 나눠서 해줘'],
    ceo: ['이 목표를 누구에게 위임할지 판단해줘', '임원 회의 안건 만들어줘', '실행 워크플로우 설계해줘'],
    cto: ['기술 스택 추천해줘', '코드 아키텍처 리뷰해줘', '개발 로드맵 작성해줘'],
    cmo: ['마케팅 전략 도와줘', '콘텐츠 캘린더 만들어줘', '브랜드 포지셔닝 분석해줘'],
    coo: ['운영 프로세스 개선안 만들어줘', 'KPI 목표 설정해줘', '팀 효율화 방안 알려줘'],
    cpo: ['제품 로드맵 작성해줘', '사용자 스토리 정리해줘', '경쟁 제품 분석해줘'],
    developer: ['TypeScript 코드 작성해줘', '버그 수정 도와줘', 'API 설계해줘'],
    researcher: ['시장 트렌드 분석해줘', '경쟁사 조사해줘', '기술 동향 리포트 써줘'],
    writer: ['블로그 포스트 써줘', 'README 작성해줘', '기획안 작성해줘'],
    analyst: ['데이터 분석해줘', 'KPI 대시보드 설계해줘', '보고서 작성해줘'],
  };
  return map[agentId] ?? ['무엇을 도와드릴까요?'];
}
