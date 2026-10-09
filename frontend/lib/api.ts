export class ApiError extends Error {
  status: number;
  code: string;
  details?: { path: string; message: string }[];
  requestId?: string;

  constructor(status: number, code: string, message: string, details?: ApiError['details'], requestId?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

// Same-origin calls: the HTTP-only session cookie is attached automatically by the browser.
export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method: opts.method ?? 'GET',
      headers: opts.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(res.status, e?.code ?? 'ERROR', e?.message ?? 'Something went wrong', e?.details, e?.requestId);
  }
  return data as T;
}

export const errorMessage = (err: unknown): string =>
  err instanceof ApiError
    ? err.details?.length
      ? `${err.message}: ${err.details.map((d) => `${d.path || 'request'} - ${d.message}`).join('; ')}`
      : err.message
    : 'Something went wrong. Please try again.';
