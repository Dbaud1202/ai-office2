import React, { useEffect, useMemo, useRef, useState } from 'react';

type WebviewElement = HTMLWebViewElement & {
  src: string;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  getURL: () => string;
};

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<WebviewElement>, WebviewElement> & {
        src?: string;
        partition?: string;
        webpreferences?: string;
      };
    }
  }
}

const WEBVIEW_SERVICES = [
  { id: 'claude', label: 'Claude', icon: '🤖', url: 'https://claude.ai', color: 'text-orange-400' },
  { id: 'chatgpt', label: 'ChatGPT', icon: '💬', url: 'https://chat.openai.com', color: 'text-emerald-400' },
  { id: 'gemini', label: 'Gemini', icon: '✨', url: 'https://gemini.google.com', color: 'text-blue-400' },
] as const;

type ServiceId = typeof WEBVIEW_SERVICES[number]['id'];

export default function WebViewPage() {
  const [activeId, setActiveId] = useState<ServiceId>('claude');
  const [isLoading, setIsLoading] = useState(false);
  const [currentUrl, setCurrentUrl] = useState<string>(WEBVIEW_SERVICES[0].url);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const webviewRefs = useRef<Record<string, WebviewElement | null>>({});

  const activeService = useMemo(
    () => WEBVIEW_SERVICES.find((service) => service.id === activeId) ?? WEBVIEW_SERVICES[0],
    [activeId]
  );

  function updateNavState(webview: WebviewElement | null) {
    if (!webview) return;
    try {
      setCurrentUrl(webview.getURL?.() || activeService.url);
      setCanGoBack(Boolean(webview.canGoBack?.()));
      setCanGoForward(Boolean(webview.canGoForward?.()));
    } catch {
      setCurrentUrl(activeService.url);
      setCanGoBack(false);
      setCanGoForward(false);
    }
  }

  useEffect(() => {
    const cleanups = WEBVIEW_SERVICES.map((service) => {
      const webview = webviewRefs.current[service.id];
      if (!webview) return undefined;

      const onStart = () => {
        if (service.id === activeId) setIsLoading(true);
      };
      const onStop = () => {
        if (service.id === activeId) {
          setIsLoading(false);
          updateNavState(webview);
        }
      };
      const onNavigate = (event: Event) => {
        if (service.id !== activeId) return;
        setCurrentUrl((event as Event & { url?: string }).url ?? webview.getURL?.() ?? service.url);
        updateNavState(webview);
      };

      webview.addEventListener('did-start-loading', onStart);
      webview.addEventListener('did-stop-loading', onStop);
      webview.addEventListener('did-navigate', onNavigate);
      webview.addEventListener('did-navigate-in-page', onNavigate);

      return () => {
        webview.removeEventListener('did-start-loading', onStart);
        webview.removeEventListener('did-stop-loading', onStop);
        webview.removeEventListener('did-navigate', onNavigate);
        webview.removeEventListener('did-navigate-in-page', onNavigate);
      };
    });

    updateNavState(webviewRefs.current[activeId]);
    return () => cleanups.forEach((cleanup) => cleanup?.());
  }, [activeId]);

  function activeWebview() {
    return webviewRefs.current[activeId];
  }

  function goBack() {
    const webview = activeWebview();
    if (webview?.canGoBack()) webview.goBack();
  }

  function goForward() {
    const webview = activeWebview();
    if (webview?.canGoForward()) webview.goForward();
  }

  function reload() {
    activeWebview()?.reload();
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-chat-bg">
      <header className="drag-region h-10 flex items-center gap-3 px-5 border-b border-chat-border flex-shrink-0">
        <span className="no-drag text-sm font-semibold text-white">🌐 AI 서비스</span>
        {isLoading && <span className="no-drag text-xs text-sidebar-muted">불러오는 중...</span>}
      </header>

      <div className="border-b border-chat-border bg-[#1e1f24] px-3 py-2">
        <div className="no-drag flex gap-1 overflow-x-auto">
          {WEBVIEW_SERVICES.map((service) => (
            <button
              key={service.id}
              onClick={() => {
                setActiveId(service.id);
                setCurrentUrl(webviewRefs.current[service.id]?.getURL?.() || service.url);
              }}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                activeId === service.id
                  ? 'bg-sidebar-hover text-white'
                  : 'text-sidebar-muted hover:bg-sidebar-hover/70 hover:text-white'
              }`}
            >
              <span className={service.color}>{service.icon}</span>
              <span className="whitespace-nowrap">{service.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="no-drag flex items-center gap-2 border-b border-chat-border bg-[#222529] px-3 py-2">
        <button
          onClick={goBack}
          disabled={!canGoBack}
          className="h-8 w-8 rounded-lg text-sidebar-muted hover:bg-sidebar-hover hover:text-white disabled:opacity-40"
          title="뒤로"
        >
          ←
        </button>
        <button
          onClick={goForward}
          disabled={!canGoForward}
          className="h-8 w-8 rounded-lg text-sidebar-muted hover:bg-sidebar-hover hover:text-white disabled:opacity-40"
          title="앞으로"
        >
          →
        </button>
        <button
          onClick={reload}
          className="h-8 w-8 rounded-lg text-sidebar-muted hover:bg-sidebar-hover hover:text-white"
          title="새로고침"
        >
          ↻
        </button>
        <div className="min-w-0 flex-1 truncate rounded-lg border border-chat-border bg-[#1a1d21] px-3 py-1.5 text-xs text-sidebar-muted">
          {currentUrl || activeService.url}
        </div>
      </div>

      <div className="no-drag relative flex-1 bg-[#111318]">
        {WEBVIEW_SERVICES.map((service) => (
          <webview
            key={service.id}
            ref={(node) => {
              webviewRefs.current[service.id] = node as WebviewElement | null;
            }}
            src={service.url}
            partition={`persist:${service.id}`}
            webpreferences="contextIsolation=yes,nodeIntegration=no,sandbox=yes"
            style={{
              width: '100%',
              height: '100%',
              display: activeId === service.id ? 'flex' : 'none',
            }}
          />
        ))}
      </div>
    </div>
  );
}
