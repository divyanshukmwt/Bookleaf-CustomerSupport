import { ProviderError } from './types';

const isRetryableStatus = (s: number) => s === 408 || s === 425 || s === 429 || s >= 500;

// Shared POST helper: timeout via AbortController, status -> retryable/non-retryable mapping.
// Error messages never include request headers (API keys) or the prompt.
export async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      const retryable = isRetryableStatus(res.status);
      const detail = retryable ? '' : `: ${text.slice(0, 200)}`;
      throw new ProviderError(`Provider returned HTTP ${res.status}${detail}`, retryable, res.status);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new ProviderError('Provider returned a non-JSON body', true, res.status);
    }
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    const timedOut = (err as Error)?.name === 'AbortError';
    throw new ProviderError(timedOut ? 'Provider request timed out' : 'Provider network error', true);
  } finally {
    clearTimeout(timer);
  }
}
