import type { AIProviderId } from './types.js';

function electronAPI() {
  return typeof window !== 'undefined' ? (window as any).electronAPI : null;
}

/**
 * Electron에서는 메인 프로세스(safeStorage 키 직접 읽기)로 HTTP 요청 중계.
 * 웹 빌드에서는 directFetch를 그대로 실행.
 * 반환값: 파싱 전 raw JSON 객체
 */
export async function fetchModelsViaElectron(
  providerId: AIProviderId,
  directFetch: () => Promise<Response>,
  apiKey?: string,
): Promise<any> {
  const api = electronAPI();
  if (api?.providerFetchModels) {
    const result = await api.providerFetchModels(providerId, apiKey);
    if (!result?.ok) throw new Error(result?.error ?? `HTTP ${result?.status}`);
    return result.data;
  }
  const res = await directFetch();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
