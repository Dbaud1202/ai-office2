// Microsoft Edge Neural TTS - 무료, API 키 불필요
// Edge 브라우저 내부 WebSocket 서비스를 사용하여 Azure 동급 품질 음성 합성

const EDGE_TTS_WS = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&ConnectionId=';

export interface EdgeTTSVoice {
  id: string;
  name: string;
  gender: 'Female' | 'Male';
}

export const KOREAN_VOICES: EdgeTTSVoice[] = [
  { id: 'ko-KR-SunHiNeural', name: '선희 (여성, 표준)', gender: 'Female' },
  { id: 'ko-KR-YuJinNeural', name: '유진 (여성, 밝음)', gender: 'Female' },
  { id: 'ko-KR-JiMinNeural', name: '지민 (여성, 친근)', gender: 'Female' },
  { id: 'ko-KR-SeoHyeonNeural', name: '서현 (여성, 차분)', gender: 'Female' },
  { id: 'ko-KR-InJoonNeural', name: '인준 (남성, 표준)', gender: 'Male' },
  { id: 'ko-KR-HyunsuNeural', name: '현수 (남성, 대화형)', gender: 'Male' },
  { id: 'ko-KR-BongJinNeural', name: '봉진 (남성)', gender: 'Male' },
];

function uuid(): string {
  return 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'.replace(/x/g, () =>
    ((Math.random() * 16) | 0).toString(16)
  );
}

function cleanTextForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '코드 블록은 화면을 확인해주세요.')
    .replace(/`[^`]+`/g, (m) => m.slice(1, -1))
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/&/g, '그리고')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 4000);
}

function toSsml(text: string, voice: string, ratePct: number, pitchPct: number): string {
  const rateStr = ratePct >= 0 ? `+${ratePct}%` : `${ratePct}%`;
  const pitchStr = pitchPct >= 0 ? `+${pitchPct}%` : `${pitchPct}%`;
  const safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='ko-KR'><voice name='${voice}'><prosody rate='${rateStr}' pitch='${pitchStr}'>${safe}</prosody></voice></speak>`;
}

// 현재 재생 중인 AudioContext를 추적해서 stop 가능하게
let _activeSource: AudioBufferSourceNode | null = null;
let _activeCtx: AudioContext | null = null;

export function stopEdgeTTS(): void {
  try {
    _activeSource?.stop();
  } catch {}
  _activeSource = null;
  _activeCtx?.close().catch(() => {});
  _activeCtx = null;
}

export async function speakEdgeTTS(
  text: string,
  opts: {
    voice?: string;
    ratePct?: number;
    pitchPct?: number;
    onStart?: () => void;
    onEnd?: () => void;
  } = {}
): Promise<void> {
  const voice = opts.voice ?? localStorage.getItem('ao2-tts-voice') ?? 'ko-KR-SunHiNeural';
  const ratePct = opts.ratePct ?? parseInt(localStorage.getItem('ao2-tts-rate') ?? '0', 10);
  const pitchPct = opts.pitchPct ?? parseInt(localStorage.getItem('ao2-tts-pitch') ?? '0', 10);

  const cleaned = cleanTextForSpeech(text);
  if (!cleaned) return;

  stopEdgeTTS();

  return new Promise<void>((resolve, reject) => {
    const connId = uuid();
    const ws = new WebSocket(`${EDGE_TTS_WS}${connId}`);
    ws.binaryType = 'arraybuffer';

    const chunks: ArrayBuffer[] = [];
    let settled = false;

    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      ws.close();
      if (err) {
        reject(err);
        return;
      }
      playChunks(chunks, opts.onEnd)
        .then(resolve)
        .catch(reject);
    };

    const timer = setTimeout(() => done(new Error('Edge TTS timeout')), 20000);

    ws.onopen = () => {
      const now = new Date().toISOString();
      // 1. Config
      ws.send(
        `X-Timestamp:${now}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'false' },
                outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
              },
            },
          },
        })
      );
      // 2. SSML
      const reqId = uuid();
      const ssml = toSsml(cleaned, voice, ratePct, pitchPct);
      ws.send(
        `X-RequestId:${reqId}\r\nX-Timestamp:${new Date().toISOString()}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`
      );
      opts.onStart?.();
    };

    ws.onmessage = (evt) => {
      if (typeof evt.data === 'string') {
        if (evt.data.includes('Path:turn.end')) {
          clearTimeout(timer);
          done();
        }
      } else if (evt.data instanceof ArrayBuffer && evt.data.byteLength > 2) {
        // 첫 2바이트: 헤더 길이
        const headerLen = new DataView(evt.data).getUint16(0);
        const audio = evt.data.slice(2 + headerLen);
        if (audio.byteLength > 0) chunks.push(audio);
      }
    };

    ws.onerror = () => {
      clearTimeout(timer);
      done(new Error('Edge TTS WebSocket 오류'));
    };

    ws.onclose = () => clearTimeout(timer);
  });
}

async function playChunks(chunks: ArrayBuffer[], onEnd?: () => void): Promise<void> {
  if (!chunks.length) { onEnd?.(); return; }

  const total = chunks.reduce((s, c) => s + c.byteLength, 0);
  const merged = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { merged.set(new Uint8Array(c), off); off += c.byteLength; }

  const ctx = new AudioContext();
  _activeCtx = ctx;

  try {
    const buf = await ctx.decodeAudioData(merged.buffer);
    const src = ctx.createBufferSource();
    _activeSource = src;
    src.buffer = buf;
    src.connect(ctx.destination);
    await new Promise<void>((res) => {
      src.onended = () => { onEnd?.(); res(); };
      src.start(0);
    });
  } finally {
    _activeSource = null;
    _activeCtx = null;
    ctx.close().catch(() => {});
  }
}

// Web Speech API 폴백 (Edge TTS 실패 시)
export function speakFallback(text: string): void {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(cleanTextForSpeech(text));
  utterance.lang = 'ko-KR';
  utterance.rate = 1.05;
  utterance.pitch = 1;

  // 가장 좋은 한국어 음성 선택 (Neural 우선)
  const voices = window.speechSynthesis.getVoices();
  const preferred = [
    'Microsoft SunHi Online (Natural) - Korean (Korea)',
    'Microsoft InJoon Online (Natural) - Korean (Korea)',
    'Microsoft Heami - Korean (Korea)',
  ];
  for (const name of preferred) {
    const v = voices.find((voice) => voice.name === name);
    if (v) { utterance.voice = v; break; }
  }

  window.speechSynthesis.speak(utterance);
}

export async function speak(text: string, opts?: Parameters<typeof speakEdgeTTS>[1]): Promise<void> {
  try {
    await speakEdgeTTS(text, opts);
  } catch {
    speakFallback(text);
  }
}

export function stopSpeech(): void {
  stopEdgeTTS();
  window.speechSynthesis?.cancel();
}
