import { postJson } from './http';
import { ProviderError, type LlmProvider, type LlmRequest, type LlmResponse } from './types';

export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic' as const;

  constructor(
    readonly model: string,
    private readonly apiKey: string,
    private readonly timeoutMs: number,
  ) {}

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const data = await postJson(
      'https://api.anthropic.com/v1/messages',
      { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
      {
        model: this.model,
        max_tokens: req.maxOutputTokens,
        temperature: req.temperature ?? 0.2,
        system: req.system,
        messages: [{ role: 'user', content: req.user }],
      },
      this.timeoutMs,
    );
    const blocks: unknown = data?.content;
    const text = Array.isArray(blocks)
      ? blocks.filter((b: any) => b?.type === 'text').map((b: any) => String(b.text ?? '')).join('')
      : '';
    if (!text.trim()) throw new ProviderError('Anthropic returned an empty response', false);
    return { text, inputTokens: data?.usage?.input_tokens ?? null, outputTokens: data?.usage?.output_tokens ?? null };
  }
}
