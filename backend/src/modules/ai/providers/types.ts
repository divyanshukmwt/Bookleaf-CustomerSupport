export type ProviderName = 'gemini' | 'openai' | 'anthropic';

export interface LlmRequest {
  system: string;
  user: string;
  maxOutputTokens: number;
  temperature?: number;
}

export interface LlmResponse {
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

// The only thing business logic knows about an LLM vendor.
export interface LlmProvider {
  readonly name: ProviderName;
  readonly model: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}

// retryable = temporary provider-side problem (timeout, network, 429, 5xx) -> fallback is allowed.
// Non-retryable = our request/config is wrong (400/401/403/404) -> fallback would not help.
export class ProviderError extends Error {
  readonly retryable: boolean;
  readonly status: number | null;

  constructor(message: string, retryable: boolean, status: number | null = null) {
    super(message);
    this.name = 'ProviderError';
    this.retryable = retryable;
    this.status = status;
  }
}
