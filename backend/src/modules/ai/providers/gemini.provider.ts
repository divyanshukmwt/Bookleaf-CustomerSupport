
import { postJson } from './http';
import {
  ProviderError,
  type LlmProvider,
  type LlmRequest,
  type LlmResponse,
} from './types';

export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini' as const;

  constructor(
    readonly model: string,
    private readonly apiKey: string,
    private readonly timeoutMs: number,
  ) {}

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: req.maxOutputTokens,
      responseMimeType: 'application/json',
    };

    if (this.model.startsWith('gemini-3')) {
      // Gemini 3.x uses thinkingLevel instead of thinkingBudget.
      generationConfig.thinkingConfig = {
        thinkingLevel: 'minimal',
      };
    } else {
      generationConfig.temperature = req.temperature ?? 0.2;

      if (this.model.includes('flash')) {
        generationConfig.thinkingConfig = {
          thinkingBudget: 0,
        };
      }
    }

    const data = await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
      { 'x-goog-api-key': this.apiKey },
      {
        systemInstruction: {
          parts: [{ text: req.system }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: req.user }],
          },
        ],
        generationConfig,
      },
      this.timeoutMs,
    );

    const parts: unknown = data?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts)
      ? parts.map((p: any) => String(p?.text ?? '')).join('')
      : '';

    if (!text.trim()) {
      throw new ProviderError('Gemini returned an empty response', false);
    }

    return {
      text,
      inputTokens: data?.usageMetadata?.promptTokenCount ?? null,
      outputTokens: data?.usageMetadata?.candidatesTokenCount ?? null,
    };
  }
}
