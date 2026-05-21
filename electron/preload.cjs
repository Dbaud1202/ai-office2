'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close'),

  // AI chat
  providerChat: (params) => ipcRenderer.invoke('provider-chat', params),
  anthropicChat: (params) => ipcRenderer.invoke('anthropic-chat', params),
  computerAgentChat: (params) => ipcRenderer.invoke('computer-agent-chat', params),
  computerTool: (params) => ipcRenderer.invoke('computer-tool', params),
  discordWebhookSend: (params) => ipcRenderer.invoke('discord-webhook-send', params),
  discordFetchMessages: (params) => ipcRenderer.invoke('discord-fetch-messages', params),

  // Vault
  vaultRead: (params) => ipcRenderer.invoke('vault-read', params),
  vaultWrite: (params) => ipcRenderer.invoke('vault-write', params),
  vaultList: (params) => ipcRenderer.invoke('vault-list', params),
  vaultSearch: (params) => ipcRenderer.invoke('vault-search', params),
  vaultRoot: () => ipcRenderer.invoke('vault-root'),
  openVaultFolder: () => ipcRenderer.invoke('open-vault-folder'),
  openVaultSubfolder: (subfolder) => ipcRenderer.invoke('open-vault-subfolder', subfolder),
  openObsidianVault: () => ipcRenderer.invoke('open-obsidian-vault'),

  // Notifications
  showNotification: (params) => ipcRenderer.invoke('show-notification', params),

  // Provider key storage (safeStorage)
  providerKeySet: (id, key) => ipcRenderer.invoke('provider-key-set', { id, key }),
  providerKeyGetAll: () => ipcRenderer.invoke('provider-key-get-all'),
  // 메인 프로세스에서 키를 직접 읽어 모델 목록 조회
  providerFetchModels: (providerId, fallbackKey) => ipcRenderer.invoke('provider-fetch-models', { providerId, fallbackKey }),

  // App control (UIAutomation - 카카오톡 등 모든 앱 조작)
  appListWindows: () => ipcRenderer.invoke('computer-tool', { name: 'app_list_windows', input: {} }),
  appFocusWindow: (processName) => ipcRenderer.invoke('computer-tool', { name: 'app_focus_window', input: { processName } }),
  appGetUiTree: (processName, maxElements) => ipcRenderer.invoke('computer-tool', { name: 'app_get_ui_tree', input: { processName, maxElements } }),
  appClickElement: (processName, elementName, automationId) => ipcRenderer.invoke('computer-tool', { name: 'app_click_element', input: { processName, elementName, automationId } }),
  appSetText: (processName, text, clearFirst, pressEnter) => ipcRenderer.invoke('computer-tool', { name: 'app_set_text', input: { processName, text, clearFirst, pressEnter } }),
  appSendHotkey: (processName, hotkey) => ipcRenderer.invoke('computer-tool', { name: 'app_send_hotkey', input: { processName, hotkey } }),

  // Platform check
  isElectron: true,
});
