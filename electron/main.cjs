'use strict';

const { app, BrowserWindow, ipcMain, safeStorage, shell, Notification, desktopCapturer, screen } = require('electron');
const { exec } = require('child_process');
const http = require('http');
const https = require('https');
const path = require('path');
const fsSync = require('fs');
const isDev = process.env.NODE_ENV === 'development';

// ── Provider key storage (safeStorage) ──────────────────────────────────────
function getKeysFilePath() {
  return path.join(app.getPath('userData'), 'provider-keys.json');
}

function readEncryptedKeys() {
  try {
    const raw = fsSync.readFileSync(getKeysFilePath(), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeEncryptedKeys(store) {
  fsSync.writeFileSync(getKeysFilePath(), JSON.stringify(store), 'utf-8');
}

ipcMain.handle('provider-key-set', (_, { id, key }) => {
  const store = readEncryptedKeys();
  if (key) {
    store[id] = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(key).toString('base64')
      : key;
  } else {
    delete store[id];
  }
  writeEncryptedKeys(store);
  return { ok: true };
});

ipcMain.handle('provider-key-get-all', () => {
  const store = readEncryptedKeys();
  const result = {};
  for (const [id, raw] of Object.entries(store)) {
    try {
      result[id] = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(Buffer.from(raw, 'base64'))
        : raw;
    } catch {
      result[id] = '';
    }
  }
  return { ok: true, data: result };
});

function decryptKey(providerId) {
  const store = readEncryptedKeys();
  const raw = store[providerId];
  if (!raw) return '';
  try {
    return safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(Buffer.from(raw, 'base64'))
      : raw;
  } catch {
    return '';
  }
}

// http:// 와 https:// 모두 처리하는 범용 HTTP 요청
function universalHttpJson(method, urlStr, body, headers = {}) {
  return new Promise((resolve) => {
    let url;
    try { url = new URL(urlStr); } catch { return resolve({ ok: false, error: '잘못된 URL' }); }
    const mod = url.protocol === 'https:' ? https : http;
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    };
    const req = mod.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: data ? JSON.parse(data) : null });
        } catch {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data });
        }
      });
    });
    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    if (payload) req.write(payload);
    req.end();
  });
}

// 메인 프로세스에서 직접 키를 읽어 모델 목록 조회
ipcMain.handle('provider-fetch-models', async (_, { providerId, fallbackKey }) => {
  const key = decryptKey(providerId) || fallbackKey || '';
  try {
    switch (providerId) {
      case 'openai':
        return universalHttpJson('GET', 'https://api.openai.com/v1/models', null, { Authorization: `Bearer ${key}` });
      case 'claude':
        return universalHttpJson('GET', 'https://api.anthropic.com/v1/models?limit=50', null, {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        });
      case 'gemini':
        return universalHttpJson('GET', `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`, null, {});
      case 'deepseek':
        return universalHttpJson('GET', 'https://api.deepseek.com/models', null, { Authorization: `Bearer ${key}` });
      case 'kimi':
        return universalHttpJson('GET', 'https://api.moonshot.ai/v1/models', null, { Authorization: `Bearer ${key}` });
      case 'minimax':
        return universalHttpJson('GET', 'https://api.minimax.io/v1/models', null, { Authorization: `Bearer ${key}` });
      case 'openrouter':
        return universalHttpJson('GET', 'https://openrouter.ai/api/v1/models', null, { Authorization: `Bearer ${key}` });
      case 'ollama': {
        const base = key?.startsWith('http') ? key.replace(/\/$/, '') : 'http://localhost:11434';
        return universalHttpJson('GET', `${base}/api/tags`, null, {});
      }
      default:
        return { ok: false, error: `지원하지 않는 프로바이더: ${providerId}` };
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
// ────────────────────────────────────────────────────────────────────────────

function openAiCompatibleChat({ apiKey, model, systemPrompt, messages, baseURL, headers }) {
  return universalHttpJson('POST', `${String(baseURL || 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`, {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    max_tokens: 2048,
  }, {
    Authorization: `Bearer ${apiKey}`,
    ...(headers || {}),
  });
}

function geminiChat({ apiKey, model, systemPrompt, messages }) {
  const last = messages[messages.length - 1]?.content || '';
  const history = messages.slice(0, -1).map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));
  return universalHttpJson(
    'POST',
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [...history, { role: 'user', parts: [{ text: last }] }],
      generationConfig: { maxOutputTokens: 2048 },
    },
    {}
  );
}

function claudeChat({ apiKey, model, systemPrompt, messages }) {
  return universalHttpJson('POST', 'https://api.anthropic.com/v1/messages', {
    model,
    max_tokens: 2048,
    system: systemPrompt,
    messages,
  }, {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  });
}

function ollamaChat({ apiKey, model, systemPrompt, messages }) {
  const base = apiKey?.startsWith('http') ? apiKey.replace(/\/$/, '') : 'http://localhost:11434';
  return universalHttpJson('POST', `${base}/api/chat`, {
    model,
    stream: false,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
  }, {});
}

ipcMain.handle('provider-chat', async (_, params) => {
  const { providerId } = params;
  const apiKey = params.apiKey || decryptKey(providerId);
  if (!apiKey && providerId !== 'ollama') return { ok: false, error: `${providerId} API key is missing` };

  try {
    if (providerId === 'claude') {
      const result = await claudeChat({ ...params, apiKey });
      if (!result.ok) return { ok: false, error: result.data?.error?.message || result.error || `HTTP ${result.status}` };
      const text = (result.data?.content || []).filter((block) => block.type === 'text').map((block) => block.text).join('');
      return { ok: true, data: { text } };
    }

    if (providerId === 'gemini') {
      const result = await geminiChat({ ...params, apiKey });
      if (!result.ok) return { ok: false, error: result.data?.error?.message || result.error || `HTTP ${result.status}` };
      const text = (result.data?.candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join('');
      return { ok: true, data: { text } };
    }

    if (providerId === 'ollama') {
      const result = await ollamaChat({ ...params, apiKey });
      if (!result.ok) return { ok: false, error: result.data?.error || result.error || `HTTP ${result.status}` };
      return { ok: true, data: { text: result.data?.message?.content || '' } };
    }

    const result = await openAiCompatibleChat({ ...params, apiKey });
    if (!result.ok) return { ok: false, error: result.data?.error?.message || result.error || `HTTP ${result.status}` };
    return { ok: true, data: { text: result.data?.choices?.[0]?.message?.content || '' } };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

let mainWindow;

function getVaultRoot() {
  return process.env.AIOFFICE_VAULT_ROOT || path.join(app.getPath('documents'), 'AI오피스2 Vault');
}

function ensureVaultRoot() {
  const root = getVaultRoot();
  const folders = [
    '작업/자동저장',
    '작업/완료',
    '작업/진행중',
    '작업/정리된대화',
    '장기기억',
    '위키/에이전트',
    '에이전트-로그/cto',
    '에이전트-로그/cmo',
    '에이전트-로그/coo',
    '에이전트-로그/cpo',
    '에이전트-로그/developer',
    '에이전트-로그/researcher',
    '에이전트-로그/writer',
    '지식베이스/기술',
    '지식베이스/참고자료',
    '지식베이스/트렌드',
    '코드베이스/스니펫',
    '코드베이스/아키텍처',
    '콘텐츠/기획',
    '콘텐츠/문서',
    '콘텐츠/블로그',
    '프로젝트',
    '템플릿',
  ];

  fsSync.mkdirSync(root, { recursive: true });
  fsSync.mkdirSync(path.join(root, '.obsidian'), { recursive: true });
  for (const folder of folders) {
    fsSync.mkdirSync(path.join(root, folder), { recursive: true });
  }

  const readmePath = path.join(root, 'README.md');
  if (!fsSync.existsSync(readmePath)) {
    fsSync.writeFileSync(
      readmePath,
      '# AI오피스2 Vault\n\nAI 에이전트의 작업 결과, 장기기억, 위키가 자동으로 저장되는 Obsidian vault입니다.\n',
      'utf-8'
    );
  }

  const homePath = path.join(root, '위키', 'Home.md');
  if (!fsSync.existsSync(homePath)) {
    fsSync.writeFileSync(homePath, '# AI 오피스 위키\n\n## 최근 작업\n\n## 에이전트\n', 'utf-8');
  }

  return root;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1a1d21',
    titleBarStyle: 'hidden',
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  ensureVaultRoot();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Window controls
ipcMain.handle('window-minimize', () => mainWindow?.minimize());
ipcMain.handle('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.restore();
  else mainWindow?.maximize();
});
ipcMain.handle('window-close', () => mainWindow?.close());

function uniquePaths(paths) {
  return [...new Set(paths.filter(Boolean).map((item) => path.resolve(item).toLowerCase()))];
}

function getAutomationRoots() {
  const home = app.getPath('home');
  const appData = app.getPath('appData');
  return uniquePaths([
    app.getPath('desktop'),
    app.getPath('documents'),
    app.getPath('downloads'),
    ensureVaultRoot(),
    process.cwd(),
    path.join(home, '.codex'),
    path.join(home, '.agents'),
    path.join(appData, 'Claude'),
  ]);
}

function isInsidePath(child, parent) {
  const childPath = path.resolve(child).toLowerCase();
  const parentPath = path.resolve(parent).toLowerCase();
  return childPath === parentPath || childPath.startsWith(`${parentPath}${path.sep}`);
}

function isPathAllowed(target) {
  if (!target || typeof target !== 'string') return false;
  const resolved = path.resolve(target);
  return getAutomationRoots().some((root) => isInsidePath(resolved, root));
}

function isDestructivePathAllowed(target) {
  if (!isPathAllowed(target)) return false;
  const resolved = path.resolve(target);
  const protectedRoots = uniquePaths([
    app.getPath('desktop'),
    app.getPath('documents'),
    app.getPath('downloads'),
    ensureVaultRoot(),
    process.cwd(),
    path.join(app.getPath('home'), '.codex', 'skills'),
    path.join(app.getPath('home'), '.agents', 'skills'),
  ]);
  return protectedRoots.some((root) => isInsidePath(resolved, root) && path.resolve(resolved).toLowerCase() !== root);
}

function looksSensitivePath(target) {
  const lower = String(target || '').toLowerCase();
  return [
    '\\.ssh\\',
    '/.ssh/',
    'provider-keys.json',
    'password',
    'passwd',
    'credential',
    'secret',
    'private key',
    'wallet',
    'metamask',
    'chrome\\user data',
    'edge\\user data',
    'firefox\\profiles',
    '\\cookies',
    '/cookies',
    '.env',
    'id_rsa',
    'id_ed25519',
  ].some((needle) => lower.includes(needle));
}

function safeToolError(message) {
  return `Blocked by local safety harness: ${message}`;
}

function isSafeSkillsCommand(command) {
  const trimmed = String(command || '').trim();
  const lower = trimmed.toLowerCase();
  if (!lower.startsWith('npx skills ') && !lower.startsWith('npx --yes skills ')) return false;
  if (/[;&|<>`$]/.test(trimmed)) return false;

  const addMatch = trimmed.match(/^npx\s+(?:--yes\s+)?skills\s+add\s+(['"]?)([^'"\s]+)\1\s+--all\s+-g$/i);
  if (addMatch) {
    return /^(?:https:\/\/github\.com\/)?[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(addMatch[2]);
  }

  const updateAllMatch = trimmed.match(/^npx\s+skills\s+update\s+-g\s+-y$/i);
  if (updateAllMatch) return true;

  const updateOneMatch = trimmed.match(/^npx\s+skills\s+update\s+-g\s+-s\s+(['"]?)([A-Za-z0-9_.:@/-]+)\1\s+-y$/i);
  return Boolean(updateOneMatch);
}

function isSafePowerShellCommand(command) {
  const trimmed = String(command || '').trim();
  const lower = trimmed.toLowerCase();
  if (!trimmed) return false;
  if (looksSensitivePath(trimmed)) return false;

  const blockedTokens = [
    'invoke-webrequest',
    'iwr ',
    'curl ',
    'wget ',
    'irm ',
    'invoke-restmethod',
    'start-bitstransfer',
    'net user',
    'net localgroup',
    'set-executionpolicy',
    'reg ',
    'schtasks',
    'sc.exe',
    'bcdedit',
    'format ',
    'cipher ',
    'takeown',
    'icacls',
    'taskkill',
    'stop-process',
    'remove-item c:\\',
    'rm c:\\',
    'del c:\\',
    'rmdir c:\\',
    'start-process powershell',
    'powershell -',
    'cmd /c',
  ];
  if (blockedTokens.some((token) => lower.includes(token))) return false;

  const allowedPrefixes = [
    'get-childitem ',
    'if (test-path ',
    'test-path ',
  ];
  if (allowedPrefixes.some((prefix) => lower.startsWith(prefix))) return true;

  if (isSafeSkillsCommand(trimmed)) return true;

  if (lower.startsWith('remove-item ')) {
    const literalMatch = trimmed.match(/-LiteralPath\s+'([^']+(?:''[^']*)*)'/i);
    const rawPath = literalMatch?.[1]?.replace(/''/g, "'");
    return Boolean(rawPath && isDestructivePathAllowed(rawPath));
  }

  return false;
}

async function runPowerShellRaw(command, timeoutMs = 10000) {
  return new Promise((resolve) => {
    exec(
      `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ${JSON.stringify(command)}`,
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 * 4 },
      (error, stdout) => {
        if (error && !stdout) resolve(`Error: ${error.message}`);
        else resolve((stdout || '').trim() || 'OK');
      }
    );
  });
}

const computerToolDefinitions = [
  {
    name: 'computer_screenshot',
    description: 'Capture a screenshot of the current Windows desktop and return it as an image. Use this to see what is on screen before clicking or typing.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'computer_get_screen_size',
    description: 'Return the primary display width and height in pixels.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'computer_mouse_move',
    description: 'Move the mouse cursor to the specified screen coordinates (pixels).',
    input_schema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate in pixels' },
        y: { type: 'number', description: 'Y coordinate in pixels' },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'computer_mouse_click',
    description: 'Click the mouse at the specified screen coordinates. Takes a screenshot before clicking so you can verify the target.',
    input_schema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate in pixels' },
        y: { type: 'number', description: 'Y coordinate in pixels' },
        button: { type: 'string', enum: ['left', 'right', 'double'], description: 'Mouse button (default: left)' },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'computer_type_text',
    description: 'Type text using the keyboard. The currently focused window will receive the keystrokes.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to type' },
      },
      required: ['text'],
    },
  },
  {
    name: 'computer_key_press',
    description: 'Press a keyboard key or key combination (e.g. "Enter", "Escape", "Ctrl+C", "Alt+F4").',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key name or combination, e.g. "Enter", "Tab", "Ctrl+A"' },
      },
      required: ['key'],
    },
  },
  {
    name: 'computer_list_directory',
    description: 'List files and folders from approved local folders on this Windows computer.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute directory path.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'computer_read_file',
    description: 'Read a text file from approved local folders. Sensitive files are blocked.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute file path.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'computer_write_file',
    description: 'Create or overwrite a text file in approved local folders. Sensitive paths are blocked.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute file path.' },
        content: { type: 'string', description: 'File content.' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'computer_delete_path',
    description: 'Delete a file or folder only inside approved work folders. Protected and sensitive paths are blocked.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to delete.' },
        recursive: { type: 'boolean', description: 'Delete folders recursively.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'computer_move_path',
    description: 'Move or rename a file or folder only between approved work folders.',
    input_schema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Absolute source path.' },
        destination: { type: 'string', description: 'Absolute destination path.' },
      },
      required: ['source', 'destination'],
    },
  },
  {
    name: 'computer_copy_path',
    description: 'Copy a file or folder only between approved work folders.',
    input_schema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Absolute source path.' },
        destination: { type: 'string', description: 'Absolute destination path.' },
      },
      required: ['source', 'destination'],
    },
  },
  {
    name: 'computer_execute_command',
    description:
      'Run a tightly allow-listed PowerShell command for local skill management and simple inspection only.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'PowerShell command to execute.' },
        cwd: { type: 'string', description: 'Working directory. Optional.' },
        timeoutMs: { type: 'number', description: 'Timeout in milliseconds. Default 120000.' },
      },
      required: ['command'],
    },
  },
  {
    name: 'computer_open_path',
    description: 'Open an approved local file/folder or non-financial URL with the default Windows application.',
    input_schema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Absolute path or URL.' },
      },
      required: ['target'],
    },
  },
  {
    name: 'computer_get_system_info',
    description: 'Return basic information about this computer and useful home paths.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
];

// ── Windows App Control (UIAutomation) ──────────────────────────────────────
const appControlToolDefinitions = [
  {
    name: 'app_list_windows',
    description: '현재 열려 있는 모든 앱 창 목록을 반환합니다. 카카오톡, 크롬 등 어떤 앱이 실행 중인지 확인할 때 사용합니다.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'app_focus_window',
    description: '특정 앱 창을 앞으로 가져와 포커스합니다. 앱을 조작하기 전에 먼저 실행하세요.',
    input_schema: {
      type: 'object',
      properties: {
        processName: { type: 'string', description: '프로세스 이름 (예: KakaoTalk, notepad, chrome)' },
      },
      required: ['processName'],
    },
  },
  {
    name: 'app_get_ui_tree',
    description: 'Windows UIAutomation으로 앱의 UI 요소 트리(버튼, 텍스트필드 등)를 조회합니다. 카카오톡, 메모장 등 어떤 앱도 조작 가능합니다.',
    input_schema: {
      type: 'object',
      properties: {
        processName: { type: 'string', description: '프로세스 이름' },
        maxElements: { type: 'number', description: '반환할 최대 요소 수 (기본 50)' },
      },
      required: ['processName'],
    },
  },
  {
    name: 'app_click_element',
    description: 'UIAutomation으로 앱의 특정 UI 요소(버튼, 메뉴 등)를 클릭합니다.',
    input_schema: {
      type: 'object',
      properties: {
        processName: { type: 'string', description: '프로세스 이름' },
        elementName: { type: 'string', description: '요소 이름 (버튼 레이블 등)' },
        automationId: { type: 'string', description: '요소의 AutomationId' },
      },
      required: ['processName'],
    },
  },
  {
    name: 'app_set_text',
    description: '앱의 텍스트 입력창에 텍스트를 입력합니다. 카카오톡 메시지 입력, 메모장 작성 등에 사용합니다.',
    input_schema: {
      type: 'object',
      properties: {
        processName: { type: 'string', description: '프로세스 이름' },
        text: { type: 'string', description: '입력할 텍스트' },
        clearFirst: { type: 'boolean', description: '입력 전 기존 내용 삭제 여부 (기본 true)' },
        pressEnter: { type: 'boolean', description: '입력 후 Enter 키 전송 여부 (기본 false)' },
      },
      required: ['processName', 'text'],
    },
  },
  {
    name: 'app_send_hotkey',
    description: '특정 앱에 단축키(예: Ctrl+C, Alt+F4)를 전송합니다.',
    input_schema: {
      type: 'object',
      properties: {
        processName: { type: 'string', description: '프로세스 이름' },
        hotkey: { type: 'string', description: '단축키 (예: Ctrl+C, Ctrl+V, Alt+F4, Enter)' },
      },
      required: ['processName', 'hotkey'],
    },
  },
];

async function runAppControlTool(name, input) {
  const pn = String(input.processName || '').replace(/[^a-zA-Z0-9._\- ]/g, '');
  try {
    switch (name) {
      case 'app_list_windows': {
        const out = await runPowerShellRaw(
          `Get-Process | Where-Object {$_.MainWindowTitle -ne ''} | ForEach-Object { "$($_.ProcessName) | PID:$($_.Id) | $($_.MainWindowTitle)" } | Sort-Object`,
          10000
        );
        return out || '실행 중인 창이 없습니다.';
      }

      case 'app_focus_window': {
        const script = `
Add-Type @"
using System; using System.Runtime.InteropServices;
public class WF { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n); }
"@
$p = Get-Process -Name "${pn}" -ErrorAction SilentlyContinue | Select-Object -First 1
if (!$p) { "프로세스를 찾을 수 없습니다: ${pn}"; exit }
[WF]::ShowWindow($p.MainWindowHandle, 9)
Start-Sleep -Milliseconds 200
[WF]::SetForegroundWindow($p.MainWindowHandle)
"창 포커스 완료: $($p.ProcessName) - $($p.MainWindowTitle)"`;
        return await runPowerShellRaw(script, 10000);
      }

      case 'app_get_ui_tree': {
        const max = Math.min(Number(input.maxElements) || 50, 150);
        const script = `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$p = Get-Process -Name "${pn}" -ErrorAction SilentlyContinue | Select-Object -First 1
if (!$p) { "프로세스를 찾을 수 없습니다: ${pn}"; exit }
$root = [System.Windows.Automation.AutomationElement]::RootElement
$c = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, [int]$p.Id)
$win = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $c)
if (!$win) { "창을 찾을 수 없습니다"; exit }
$all = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
$i=0
foreach ($el in $all) {
  if ($i++ -ge ${max}) { break }
  try {
    $n=$el.Current.Name; $t=$el.Current.ControlType.ProgrammaticName.Replace("ControlType.",""); $id=$el.Current.AutomationId
    if ($n -or $id) { Write-Output "[$t] name='$n' id='$id'" }
  } catch {}
}`;
        return await runPowerShellRaw(script, 25000);
      }

      case 'app_click_element': {
        const elName = String(input.elementName || '').replace(/"/g, '');
        const autoId = String(input.automationId || '').replace(/"/g, '');
        const findCond = autoId
          ? `New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty, "${autoId}")`
          : elName
          ? `New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, "${elName}")`
          : `[System.Windows.Automation.Condition]::TrueCondition`;
        const script = `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$p = Get-Process -Name "${pn}" -ErrorAction SilentlyContinue | Select-Object -First 1
if (!$p) { "프로세스를 찾을 수 없습니다"; exit }
$root = [System.Windows.Automation.AutomationElement]::RootElement
$c = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, [int]$p.Id)
$win = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $c)
if (!$win) { "창을 찾을 수 없습니다"; exit }
$el = $win.FindFirst([System.Windows.Automation.TreeScope]::Descendants, (${findCond}))
if (!$el) { "요소를 찾을 수 없습니다: ${elName || autoId}"; exit }
$rect = $el.Current.BoundingRectangle
$x = [int]($rect.Left + $rect.Width/2); $y = [int]($rect.Top + $rect.Height/2)
Add-Type @"
using System.Runtime.InteropServices;
public class MC { [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y); [DllImport("user32.dll")] public static extern void mouse_event(int f,int dx,int dy,int c,int e); }
"@
[MC]::SetCursorPos($x, $y); Start-Sleep -Milliseconds 120
[MC]::mouse_event(0x0002,0,0,0,0); [MC]::mouse_event(0x0004,0,0,0,0)
"클릭 완료: '${elName || autoId}' at ($x, $y)"`;
        return await runPowerShellRaw(script, 20000);
      }

      case 'app_set_text': {
        const text = String(input.text || '');
        const clearFirst = input.clearFirst !== false;
        const pressEnter = Boolean(input.pressEnter);
        const escapedSendKeys = text.replace(/[+^%~(){}[\]]/g, '{$&}');
        const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
$p = Get-Process -Name "${pn}" -ErrorAction SilentlyContinue | Select-Object -First 1
if (!$p) { "프로세스를 찾을 수 없습니다"; exit }
Add-Type @"
using System.Runtime.InteropServices;
public class WS { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n); }
"@
[WS]::ShowWindow($p.MainWindowHandle, 9); [WS]::SetForegroundWindow($p.MainWindowHandle)
Start-Sleep -Milliseconds 400
${clearFirst ? "[System.Windows.Forms.SendKeys]::SendWait('^a')" : ''}
[System.Windows.Forms.SendKeys]::SendWait(${JSON.stringify(escapedSendKeys)})
${pressEnter ? "[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')" : ''}
"텍스트 입력 완료: ${pn}"`;
        return await runPowerShellRaw(script, 15000);
      }

      case 'app_send_hotkey': {
        const hotkey = String(input.hotkey || '');
        const keyMap = { 'ctrl': '^', 'alt': '%', 'shift': '+', 'win': '^%' };
        let sendKey = hotkey;
        const parts = hotkey.toLowerCase().split('+');
        if (parts.length > 1) {
          const mods = parts.slice(0, -1).map((m) => keyMap[m] || m).join('');
          const key = parts[parts.length - 1];
          const keyAlias = { 'enter': '{ENTER}', 'esc': '{ESC}', 'escape': '{ESC}', 'tab': '{TAB}',
            'del': '{DELETE}', 'delete': '{DELETE}', 'f4': '{F4}', 'f5': '{F5}', 'f6': '{F6}' };
          sendKey = mods + (keyAlias[key] || key);
        }
        const escapedKey = sendKey.replace(/[+^%~]/g, (m) => (m === '+' || m === '^' || m === '%' ? m : `{${m}}`));
        const script = `
Add-Type -AssemblyName System.Windows.Forms
$p = Get-Process -Name "${pn}" -ErrorAction SilentlyContinue | Select-Object -First 1
if (!$p) { "프로세스를 찾을 수 없습니다"; exit }
Add-Type @"
using System.Runtime.InteropServices;
public class WH { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int n); }
"@
[WH]::ShowWindow($p.MainWindowHandle,9); [WH]::SetForegroundWindow($p.MainWindowHandle)
Start-Sleep -Milliseconds 300
[System.Windows.Forms.SendKeys]::SendWait(${JSON.stringify(escapedKey)})
"단축키 전송 완료: ${hotkey} → ${pn}"`;
        return await runPowerShellRaw(script, 10000);
      }

      default:
        return `알 수 없는 앱 제어 액션: ${name}`;
    }
  } catch (err) {
    return `앱 제어 오류 (${name}): ${err.message}`;
  }
}

function limitOutput(text, max = 12000) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}\n\n... output truncated (${text.length} chars)` : text;
}

async function runComputerTool(name, input) {
  const fs = require('fs').promises;
  try {
    switch (name) {
      case 'computer_screenshot': {
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: 1280, height: 800 },
        });
        if (!sources.length) return 'No screen source available';
        const base64 = sources[0].thumbnail.toPNG().toString('base64');
        return [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64 } }];
      }
      case 'computer_get_screen_size': {
        const display = screen.getPrimaryDisplay();
        return JSON.stringify({ width: display.bounds.width, height: display.bounds.height, scaleFactor: display.scaleFactor });
      }
      case 'computer_mouse_move': {
        const { x, y } = input;
        await runPowerShellRaw(
          `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${Math.round(x)}, ${Math.round(y)})`
        );
        return `Mouse moved to (${Math.round(x)}, ${Math.round(y)})`;
      }
      case 'computer_mouse_click': {
        const { x, y, button = 'left' } = input;
        const xi = Math.round(x);
        const yi = Math.round(y);
        let psScript;
        if (button === 'double') {
          psScript = `
Add-Type @"
using System.Runtime.InteropServices;
public class WinInput {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(int f, int dx, int dy, int c, int e);
  public const int LEFTDOWN=0x02, LEFTUP=0x04;
}
"@
[WinInput]::SetCursorPos(${xi}, ${yi}); Start-Sleep -Milliseconds 80
[WinInput]::mouse_event([WinInput]::LEFTDOWN, 0, 0, 0, 0); [WinInput]::mouse_event([WinInput]::LEFTUP, 0, 0, 0, 0)
Start-Sleep -Milliseconds 80
[WinInput]::mouse_event([WinInput]::LEFTDOWN, 0, 0, 0, 0); [WinInput]::mouse_event([WinInput]::LEFTUP, 0, 0, 0, 0)`;
        } else {
          const down = button === 'right' ? 0x0008 : 0x0002;
          const up = button === 'right' ? 0x0010 : 0x0004;
          psScript = `
Add-Type @"
using System.Runtime.InteropServices;
public class WinInput {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(int f, int dx, int dy, int c, int e);
}
"@
[WinInput]::SetCursorPos(${xi}, ${yi}); Start-Sleep -Milliseconds 80
[WinInput]::mouse_event(${down}, 0, 0, 0, 0); [WinInput]::mouse_event(${up}, 0, 0, 0, 0)`;
        }
        await runPowerShellRaw(psScript);
        return `Clicked ${button} at (${xi}, ${yi})`;
      }
      case 'computer_type_text': {
        const text = String(input.text || '');
        // Escape SendKeys special chars
        const escaped = text.replace(/[+^%~(){}[\]]/g, '{$&}');
        await runPowerShellRaw(
          `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(${JSON.stringify(escaped)})`
        );
        return `Typed: ${text.slice(0, 60)}${text.length > 60 ? '...' : ''}`;
      }
      case 'computer_key_press': {
        const key = String(input.key || '');
        // Map common key names to SendKeys format
        const keyMap = {
          'enter': '{ENTER}', 'return': '{ENTER}', 'tab': '{TAB}', 'escape': '{ESC}', 'esc': '{ESC}',
          'backspace': '{BACKSPACE}', 'delete': '{DELETE}', 'del': '{DELETE}',
          'up': '{UP}', 'down': '{DOWN}', 'left': '{LEFT}', 'right': '{RIGHT}',
          'home': '{HOME}', 'end': '{END}', 'pageup': '{PGUP}', 'pagedown': '{PGDN}',
          'f1':'{F1}','f2':'{F2}','f3':'{F3}','f4':'{F4}','f5':'{F5}','f6':'{F6}',
          'f7':'{F7}','f8':'{F8}','f9':'{F9}','f10':'{F10}','f11':'{F11}','f12':'{F12}',
        };
        // Handle Ctrl/Alt/Shift combos like "Ctrl+C" → "^c"
        let sendKey = key;
        const lower = key.toLowerCase();
        if (keyMap[lower]) {
          sendKey = keyMap[lower];
        } else if (/^ctrl\+/i.test(key)) {
          const k = key.slice(5).toLowerCase();
          sendKey = `^${keyMap[k] || k}`;
        } else if (/^alt\+/i.test(key)) {
          const k = key.slice(4).toLowerCase();
          sendKey = `%${keyMap[k] || k}`;
        } else if (/^shift\+/i.test(key)) {
          const k = key.slice(6).toLowerCase();
          sendKey = `+${keyMap[k] || k}`;
        }
        await runPowerShellRaw(
          `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(${JSON.stringify(sendKey)})`
        );
        return `Key pressed: ${key}`;
      }
      case 'computer_list_directory': {
        if (!isPathAllowed(input.path) || looksSensitivePath(input.path)) {
          return safeToolError('directory is outside approved automation folders or is sensitive.');
        }
        const entries = await fs.readdir(input.path, { withFileTypes: true });
        return entries
          .map((entry) => `${entry.isDirectory() ? '[DIR] ' : '[FILE]'} ${entry.name}`)
          .join('\n') || '(empty)';
      }
      case 'computer_read_file': {
        if (!isPathAllowed(input.path) || looksSensitivePath(input.path)) {
          return safeToolError('file is outside approved automation folders or is sensitive.');
        }
        return limitOutput(await fs.readFile(input.path, 'utf-8'));
      }
      case 'computer_write_file': {
        if (!isPathAllowed(input.path) || looksSensitivePath(input.path)) {
          return safeToolError('write target is outside approved automation folders or is sensitive.');
        }
        await fs.mkdir(path.dirname(input.path), { recursive: true });
        await fs.writeFile(input.path, input.content, 'utf-8');
        return `Wrote file: ${input.path}`;
      }
      case 'computer_delete_path': {
        if (!isDestructivePathAllowed(input.path) || looksSensitivePath(input.path)) {
          return safeToolError('delete target is outside approved work folders, protected, or sensitive.');
        }
        await fs.rm(input.path, { recursive: Boolean(input.recursive), force: true });
        return `Deleted: ${input.path}`;
      }
      case 'computer_move_path': {
        if (
          !isDestructivePathAllowed(input.source) ||
          !isPathAllowed(input.destination) ||
          looksSensitivePath(input.source) ||
          looksSensitivePath(input.destination)
        ) {
          return safeToolError('move source/destination is outside approved work folders, protected, or sensitive.');
        }
        await fs.mkdir(path.dirname(input.destination), { recursive: true });
        await fs.rename(input.source, input.destination);
        return `Moved: ${input.source} -> ${input.destination}`;
      }
      case 'computer_copy_path': {
        if (
          !isPathAllowed(input.source) ||
          !isPathAllowed(input.destination) ||
          looksSensitivePath(input.source) ||
          looksSensitivePath(input.destination)
        ) {
          return safeToolError('copy source/destination is outside approved automation folders or is sensitive.');
        }
        await fs.cp(input.source, input.destination, { recursive: true, force: true });
        return `Copied: ${input.source} -> ${input.destination}`;
      }
      case 'computer_execute_command': {
        if (!isSafePowerShellCommand(input.command)) {
          return safeToolError('PowerShell command is not on the local automation allow-list.');
        }
        if (input.cwd && (!isPathAllowed(input.cwd) || looksSensitivePath(input.cwd))) {
          return safeToolError('working directory is outside approved automation folders or is sensitive.');
        }
        return await new Promise((resolve) => {
          const child = exec(
            `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ${JSON.stringify(input.command)}`,
            {
              cwd: input.cwd || process.cwd(),
              timeout: Math.min(Number(input.timeoutMs) || 120000, 600000),
              windowsHide: true,
              maxBuffer: 1024 * 1024 * 10,
            },
            (error, stdout, stderr) => {
              const parts = [];
              if (stdout) parts.push(`STDOUT:\n${stdout}`);
              if (stderr) parts.push(`STDERR:\n${stderr}`);
              if (error) parts.push(`ERROR:\n${error.message}`);
              resolve(limitOutput(parts.join('\n\n') || 'Command completed with no output.'));
            }
          );
          child.stdin?.end();
        });
      }
      case 'computer_open_path': {
        const target = input.target;
        if (!/^https?:\/\//i.test(target) && (!isPathAllowed(target) || looksSensitivePath(target))) {
          return safeToolError('open target is outside approved automation folders or is sensitive.');
        }
        const error = /^https?:\/\//i.test(target)
          ? await shell.openExternal(target)
          : await shell.openPath(target);
        return error ? `Open failed: ${error}` : `Opened: ${target}`;
      }
      case 'computer_get_system_info': {
        return JSON.stringify({
          platform: process.platform,
          arch: process.arch,
          cwd: process.cwd(),
          home: app.getPath('home'),
          desktop: app.getPath('desktop'),
          documents: app.getPath('documents'),
          downloads: app.getPath('downloads'),
          appData: app.getPath('appData'),
          approvedAutomationRoots: getAutomationRoots(),
        }, null, 2);
      }
      default:
        if (name.startsWith('app_')) return runAppControlTool(name, input);
        return `Unknown tool: ${name}`;
    }
  } catch (err) {
    return `Tool error (${name}): ${err.message}`;
  }
}

const COMPLETION_SIGNALS = ['작업 완료', '완료했습니다', '완성했습니다', '마쳤습니다', '끝났습니다', 'task complete', 'all done', 'finished'];

function isTaskComplete(text) {
  const lower = (text || '').toLowerCase();
  return COMPLETION_SIGNALS.some((s) => lower.includes(s.toLowerCase()));
}

// Anthropic API proxy (keeps API key in main process)
// autonomous: true  → outer loop keeps re-running until completion signal or maxRounds
// maxRounds: number → max outer loop rounds (default 1 = single run, 30 for autonomous)
ipcMain.handle('anthropic-chat', async (_, { apiKey, model, systemPrompt, messages, tools, autonomous, maxRounds }) => {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic.default({ apiKey });
    const activeModel = model || 'claude-sonnet-4-6';
    const activeTools = [...computerToolDefinitions, ...appControlToolDefinitions, ...(tools || [])];
    const computerSystemNote = `[로컬 컴퓨터 조작 권한]\n이 앱은 사용자의 개인용 앱입니다. computer_* 도구로 Windows PC의 화면 캡처, 마우스/키보드 제어, 파일/폴더/앱 조작을 직접 수행할 수 있습니다.\n- computer_screenshot: 현재 화면 캡처\n- computer_mouse_click / computer_mouse_move: 마우스 제어\n- computer_type_text / computer_key_press: 키보드 제어\n- computer_read_file / computer_write_file / computer_list_directory: 파일 조작\n작업 시작 전 screenshot으로 화면을 확인하세요. 완료 시 "작업 완료"라고 보고하세요.`;
    const fullSystem = `${systemPrompt}\n\n${computerSystemNote}`;

    const outerMax = autonomous ? (maxRounds || 30) : 1;
    const workingMessages = [...messages];
    let response;

    for (let round = 0; round < outerMax; round++) {
      // Inner tool-use loop (up to 30 iterations per round)
      for (let i = 0; i < 30; i++) {
        response = await client.messages.create({
          model: activeModel,
          max_tokens: 8096,
          system: fullSystem,
          messages: workingMessages,
          tools: activeTools,
        });

        const toolUseBlocks = response.content.filter((block) => block.type === 'tool_use');
        if (toolUseBlocks.length === 0) break;

        workingMessages.push({ role: 'assistant', content: response.content });
        workingMessages.push({
          role: 'user',
          content: await Promise.all(
            toolUseBlocks.map(async (toolUse) => ({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: await runComputerTool(toolUse.name, toolUse.input || {}),
            }))
          ),
        });
      }

      if (!autonomous || round === outerMax - 1) break;

      // Check completion from last response text
      const lastText = (response.content || [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('');

      if (isTaskComplete(lastText)) break;

      // Continue to next round
      workingMessages.push({ role: 'assistant', content: response.content });
      workingMessages.push({
        role: 'user',
        content: `[라운드 ${round + 2}] 목표를 달성할 때까지 계속 작업하세요. 완료되었으면 "작업 완료"라고 명시해 주세요.`,
      });
    }

    return { ok: true, data: response };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('computer-tool', async (_, { name, input }) => {
  const data = await runComputerTool(name, input || {});
  return { ok: true, data };
});

// OpenAI 이미지 포맷으로 변환 (runComputerTool이 Anthropic 형식 반환 시)
function toOpenAIToolContent(result) {
  if (Array.isArray(result)) {
    return result.map((block) => {
      if (block.type === 'image' && block.source?.type === 'base64') {
        return {
          type: 'image_url',
          image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` },
        };
      }
      if (block.type === 'text') return block;
      return { type: 'text', text: JSON.stringify(block) };
    });
  }
  return String(result ?? '');
}

// OpenAI 호환 computer 에이전트 루프 (OpenRouter, Kimi 등에서 computer 도구 사용)
ipcMain.handle('computer-agent-chat', async (_, { apiKey, model, systemPrompt, messages, baseURL, headers, autonomous, maxRounds }) => {
  try {
    const OpenAI = require('openai');
    const client = new OpenAI.default({
      apiKey,
      baseURL: baseURL || 'https://openrouter.ai/api/v1',
      defaultHeaders: headers || {},
    });

    const openaiTools = computerToolDefinitions.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.input_schema || { type: 'object', properties: {} } },
    }));

    const computerNote = `[로컬 컴퓨터 조작 권한]\ncomputer_* 도구로 Windows PC의 화면 캡처, 마우스/키보드 제어, 파일/폴더 조작을 직접 수행할 수 있습니다.\n- computer_screenshot: 현재 화면 캡처 (작업 전 먼저 호출)\n- computer_mouse_click / computer_mouse_move: 마우스 제어\n- computer_type_text / computer_key_press: 키보드 제어\n완료 시 "작업 완료"라고 보고하세요.`;

    const workingMessages = [
      { role: 'system', content: `${systemPrompt}\n\n${computerNote}` },
      ...messages,
    ];

    const outerMax = autonomous ? (maxRounds || 30) : 1;
    let lastContent = '';

    for (let round = 0; round < outerMax; round++) {
      // Inner tool-use loop
      for (let i = 0; i < 30; i++) {
        const response = await client.chat.completions.create({
          model,
          messages: workingMessages,
          tools: openaiTools,
          max_tokens: 8096,
        });

        const message = response.choices[0].message;
        const toolCalls = message.tool_calls || [];
        lastContent = message.content || '';

        if (!toolCalls.length) {
          workingMessages.push({ role: 'assistant', content: message.content || '' });
          break;
        }

        workingMessages.push(message);

        for (const tc of toolCalls) {
          let args = {};
          try { args = JSON.parse(tc.function.arguments || '{}'); } catch {}
          const rawResult = await runComputerTool(tc.function.name, args);
          const content = toOpenAIToolContent(rawResult);
          workingMessages.push({ role: 'tool', tool_call_id: tc.id, content });
        }
      }

      if (!autonomous || round === outerMax - 1) break;
      if (isTaskComplete(lastContent)) break;

      workingMessages.push({
        role: 'user',
        content: `[라운드 ${round + 2}] 목표를 달성할 때까지 계속 작업하세요. 완료되었으면 "작업 완료"라고 알려주세요.`,
      });
    }

    // ChatContext와 동일한 response 포맷으로 반환
    return { ok: true, data: { content: [{ type: 'text', text: lastContent }] } };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

function httpsJson(method, url, body, headers = {}) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: data ? JSON.parse(data) : null });
        } catch {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data });
        }
      });
    });
    req.on('error', (error) => resolve({ ok: false, error: error.message }));
    if (payload) req.write(payload);
    req.end();
  });
}

ipcMain.handle('discord-webhook-send', async (_, { webhookUrl, content, embeds }) => {
  if (!webhookUrl) return { ok: false, error: 'webhookUrl is required' };
  return httpsJson('POST', webhookUrl, { content, embeds });
});

ipcMain.handle('discord-fetch-messages', async (_, { botToken, channelId, limit, after }) => {
  if (!botToken || !channelId) return { ok: false, error: 'botToken and channelId are required' };
  const params = new URLSearchParams({ limit: String(Math.min(Number(limit) || 10, 50)) });
  if (after) params.set('after', after);
  return httpsJson('GET', `https://discord.com/api/v10/channels/${channelId}/messages?${params.toString()}`, null, {
    Authorization: `Bot ${botToken}`,
  });
});

// Vault operations
ipcMain.handle('vault-root', () => ({ ok: true, data: ensureVaultRoot() }));

ipcMain.handle('open-vault-folder', async () => {
  const root = ensureVaultRoot();
  const error = await shell.openPath(root);
  return error ? { ok: false, error } : { ok: true, data: root };
});

ipcMain.handle('open-vault-subfolder', async (_, subfolder) => {
  const root = ensureVaultRoot();
  const target = path.join(root, subfolder);
  fsSync.mkdirSync(target, { recursive: true });
  const error = await shell.openPath(target);
  return error ? { ok: false, error } : { ok: true, data: target };
});

ipcMain.handle('open-obsidian-vault', async () => {
  const root = ensureVaultRoot();
  const vaultName = path.basename(root);

  // 1) vault 이름으로 열기 (가장 안정적)
  try {
    await shell.openExternal(`obsidian://open?vault=${encodeURIComponent(vaultName)}`);
    return { ok: true, data: root };
  } catch {}

  // 2) 절대 경로로 열기
  try {
    await shell.openExternal(`obsidian://open?path=${encodeURIComponent(root)}`);
    return { ok: true, data: root };
  } catch {}

  // 3) 폴백: 파일 탐색기로 폴더 열기
  const error = await shell.openPath(root);
  return error ? { ok: false, error } : { ok: true, data: root };
});

ipcMain.handle('vault-read', async (_, { vaultRoot, filePath }) => {
  const fs = require('fs').promises;
  const fullPath = path.join(vaultRoot || ensureVaultRoot(), filePath);
  try {
    return { ok: true, data: await fs.readFile(fullPath, 'utf-8') };
  } catch {
    return { ok: false, error: 'not found' };
  }
});

ipcMain.handle('vault-write', async (_, { vaultRoot, filePath, content }) => {
  const fs = require('fs').promises;
  const fullPath = path.join(vaultRoot || ensureVaultRoot(), filePath);
  try {
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('vault-list', async (_, { vaultRoot, folder }) => {
  const fs = require('fs').promises;
  const dir = path.join(vaultRoot || ensureVaultRoot(), folder);
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return {
      ok: true,
      data: entries.map((e) => ({ name: e.name, isDir: e.isDirectory() })),
    };
  } catch {
    return { ok: true, data: [] };
  }
});

// Vault full-text search (관련도 점수 포함)
ipcMain.handle('vault-search', async (_, { vaultRoot, query, folder }) => {
  const fs = require('fs').promises;
  const root = vaultRoot || ensureVaultRoot();
  const searchRoot = folder ? path.join(root, folder) : root;

  async function walk(dir) {
    let results = [];
    let entries = [];
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return results; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) results = results.concat(await walk(full));
      else if (e.name.endsWith('.md')) results.push(full);
    }
    return results;
  }

  try {
    const files = await walk(searchRoot);
    const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
    const matches = [];

    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      const lower = content.toLowerCase();

      // 쿼리 단어별 등장 횟수 합산 → 관련도 점수
      let score = 0;
      for (const term of terms) {
        let idx = 0;
        while ((idx = lower.indexOf(term, idx)) !== -1) { score++; idx += term.length; }
      }
      if (score === 0) continue;

      const relativePath = path.relative(root, file).replace(/\\/g, '/');
      const lines = content.split('\n');
      const title = lines.find((l) => l.startsWith('# '))?.replace(/^# /, '').trim()
        ?? path.basename(file, '.md');

      // 첫 번째 매칭 줄 + 앞뒤 문맥 포함
      const matchIdx = lines.findIndex((l) => terms.some((t) => l.toLowerCase().includes(t)));
      const snippetLines = lines.slice(Math.max(0, matchIdx - 1), matchIdx + 3);
      const snippet = snippetLines.join(' ').replace(/#{1,3} /g, '').trim().slice(0, 200);

      matches.push({ path: relativePath, title, snippet, score });
      if (matches.length >= 30) break;
    }

    // 점수 높은 순 정렬
    matches.sort((a, b) => b.score - a.score);
    return { ok: true, data: matches.slice(0, 20) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Desktop notification
ipcMain.handle('show-notification', (_, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
  return { ok: true };
});
