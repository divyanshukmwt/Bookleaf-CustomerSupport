import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { prisma } from '../../lib/prisma';
import { AnthropicProvider } from './providers/anthropic.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { OpenAIProvider } from './providers/openai.provider';
import { ProviderError, type LlmProvider } from './providers/types';

export type AiErrorCode = 'NOT_CONFIGURED' | 'UNAVAILABLE' | 'REQUEST_ERROR' | 'MALFORMED_OUTPUT';

export class AiError extends Error {
  readonly code: AiErrorCode;
  constructor(code: AiErrorCode, message: string) {
    super(message);
    this.name = 'AiError';
    this.code = code;
  }
}

export interface AiRunOptions<T> {
  ticketId: string;
  operation: 'CLASSIFICATION' | 'DRAFT' | 'SUMMARY';
  promptVersion: string;
  system: string;
  user: string;
  maxOutputTokens: number;
  temperature?: number;
  /** Must throw if the model output is malformed or fails schema validation. */
  parse: (text: string) => T;
}

export interface AiRunResult<T> {
  value: T;
  provider: string;
  model: string;
  isFallback: boolean;
}

const RETRY_HINT = '\n\nYour previous answer was not valid. Respond with ONLY the JSON object described above.';

function createProvider(cfg: (typeof env.aiProviders)[number]): LlmProvider {
  switch (cfg.provider) {
    case 'gemini':
      return new GeminiProvider(cfg.model, cfg.apiKey, env.AI_TIMEOUT_MS);
    case 'openai':
      return new OpenAIProvider(cfg.model, cfg.apiKey, env.AI_TIMEOUT_MS);
    default:
      return new AnthropicProvider(cfg.model, cfg.apiKey, env.AI_TIMEOUT_MS);
  }
}

// The only entry point business code uses for LLM calls. Handles provider order, fallback on
// retryable failures, one same-provider retry for malformed JSON, and ai_runs logging.
export class AIService {
  constructor(private readonly providers: LlmProvider[]) {}

  get isConfigured(): boolean {
    return this.providers.length > 0;
  }

  async run<T>(opts: AiRunOptions<T>): Promise<AiRunResult<T>> {
    if (!this.isConfigured) throw new AiError('NOT_CONFIGURED', 'No AI provider is configured');

    let lastProviderError = 'unknown error';
    for (const [index, provider] of this.providers.entries()) {
      const isFallback = index > 0;
      if (isFallback) {
        logger.warn({ event: 'ai.fallback', ticketId: opts.ticketId, operation: opts.operation, provider: provider.name }, 'falling back to secondary AI provider');
      }

      for (let attempt = 0; attempt < 2; attempt++) {
        const started = Date.now();
        let response;
        try {
          response = await provider.complete({
            system: opts.system,
            user: attempt === 0 ? opts.user : opts.user + RETRY_HINT,
            maxOutputTokens: opts.maxOutputTokens,
            temperature: opts.temperature,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'provider error';
          await this.record(opts, provider, isFallback, Date.now() - started, 'FAILED', null, null, message);
          if (err instanceof ProviderError && err.retryable) {
            lastProviderError = message;
            break; // retryable provider failure -> try the next provider
          }
          // Our request/config is wrong: another provider would not fix it, so do not fall back.
          throw new AiError('REQUEST_ERROR', message);
        }

        try {
          const value = opts.parse(response.text);
          await this.record(opts, provider, isFallback, Date.now() - started, 'SUCCESS', response.inputTokens, response.outputTokens, null);
          return { value, provider: provider.name, model: provider.model, isFallback };
        } catch (err) {
          const message = `Malformed output: ${err instanceof Error ? err.message : 'parse error'}`;
          await this.record(opts, provider, isFallback, Date.now() - started, 'FAILED', response.inputTokens, response.outputTokens, message);
          if (attempt === 1) throw new AiError('MALFORMED_OUTPUT', 'The AI response could not be understood');
          // attempt 0: retry once on the same provider
        }
      }
    }
    throw new AiError('UNAVAILABLE', `AI providers unavailable (${lastProviderError})`);
  }

  private async record(
    opts: AiRunOptions<unknown>,
    provider: LlmProvider,
    isFallback: boolean,
    latencyMs: number,
    status: 'SUCCESS' | 'FAILED',
    inputTokens: number | null,
    outputTokens: number | null,
    error: string | null,
  ) {
logger.info(
  {
    event: 'ai.run',
    ticketId: opts.ticketId,
    operation: opts.operation,
    provider: provider.name,
    model: provider.model,
    status,
    latencyMs,
    inputTokens,
    outputTokens,
    isFallback,
    providerError: error ? error.slice(0, 300) : undefined,
  },
  'ai run finished',
);
    try {
      await prisma.aiRun.create({
        data: {
          ticketId: opts.ticketId,
          operation: opts.operation,
          provider: provider.name,
          model: provider.model,
          promptVersion: opts.promptVersion,
          isFallback,
          inputTokens,
          outputTokens,
          latencyMs,
          status,
          error: error ? error.slice(0, 500) : null,
        },
      });
    } catch (err) {
      logger.error({ err }, 'failed to write ai_runs row'); // logging must never break the flow
    }
  }
}

export const aiService = new AIService(env.aiProviders.map(createProvider));
