import React from 'react';

function callWindowAction(action: 'minimize' | 'maximize' | 'close') {
  const api = (window as any).electronAPI;
  api?.[action]?.();
}

export default function WindowControls() {
  return (
    <div className="no-drag fixed right-0 top-0 z-[70] flex h-10 overflow-hidden border-l border-chat-border bg-chat-bg/95">
      <button
        type="button"
        title="Minimize"
        onClick={() => callWindowAction('minimize')}
        className="h-10 w-12 text-sm text-sidebar-text hover:bg-sidebar-hover"
      >
        -
      </button>
      <button
        type="button"
        title="Maximize"
        onClick={() => callWindowAction('maximize')}
        className="h-10 w-12 text-sm text-sidebar-text hover:bg-sidebar-hover"
      >
        []
      </button>
      <button
        type="button"
        title="Close"
        onClick={() => callWindowAction('close')}
        className="h-10 w-12 text-sm text-sidebar-text hover:bg-red-600 hover:text-white"
      >
        x
      </button>
    </div>
  );
}
