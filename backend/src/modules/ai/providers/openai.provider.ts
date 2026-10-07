import { postJson } from './http';
import { ProviderError, type LlmProvider, type LlmRequest, type LlmResponse } from './types';

export class OpenAIProvider implements LlmProvider {
  readonly name = 'openai' as const;

  constructor(
    readonly model: string,
    private readonly apiKey: string,
    private readonly timeoutMs: number,
  ) {}

  async complete(req: LlmRequest): Promise<LlmResponse> {
    // temperature is deliberately omitted: some newer OpenAI models reject non-default values.
    const data = await postJson(
      'https://api.openai.com/v1/chat/completions',
      { authorization: `Bearer ${this.apiKey}` },
      {
        model: this.model,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
        max_completion_tokens: req.maxOutputTokens,
        response_format: { type: 'json_object' },
      },
      this.timeoutMs,
    );
    const text: unknown = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw new ProviderError('OpenAI returned an empty response', false);
    return { text, inputTokens: data?.usage?.prompt_tokens ?? null, outputTokens: data?.usage?.completion_tokens ?? null };
  }
}
