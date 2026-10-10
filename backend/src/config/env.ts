import { z } from 'zod';
import { decideDemoLogin } from '../modules/auth/demoAccounts.logic';

const providerName = z.enum(['gemini', 'openai', 'anthropic']);

// All configuration comes from environment variables, validated once at startup.
// The process refuses to boot with a missing/invalid value (fail fast, never run half-configured).
const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),

    DATABASE_URL: z.string().min(1),

    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    SESSION_TTL_HOURS: z.coerce.number().int().positive().default(168),
    COOKIE_SECURE: z.enum(['true', 'false']).optional(),
    BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),

    // AI providers (all optional: with none configured the portal still works fully manually).
    AI_PRIMARY_PROVIDER: providerName.optional(),
    AI_PRIMARY_MODEL: z.string().min(1).optional(),
    AI_PRIMARY_API_KEY: z.string().min(1).optional(),
    AI_FALLBACK_PROVIDER: providerName.optional(),
    AI_FALLBACK_MODEL: z.string().min(1).optional(),
    AI_FALLBACK_API_KEY: z.string().min(1).optional(),
    AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(25000),

    // Evaluation quick-login (see docs/EVALUATION_LOGIN.md). Off by default. The seed passwords are only
    // read here so the login page can pre-fill them for the demo accounts, and only when DEMO_LOGIN=true.
    DEMO_LOGIN: z.enum(['true', 'false']).default('false'),
    DEMO_LOGIN_ALLOW_PRODUCTION: z.enum(['true', 'false']).default('false'),
    SEED_AUTHOR_PASSWORD: z.string().optional(),
    SEED_ADMIN_PASSWORD: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    // The .env.example placeholder is long enough to pass the length check, so reject it explicitly in
    // production: otherwise an unedited .env would run with a publicly known signing secret.
    if (v.NODE_ENV === 'production' && v.JWT_SECRET.startsWith('replace-with')) {
      ctx.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: 'JWT_SECRET is still the .env.example placeholder; generate a real secret' });
    }
    for (const message of decideDemoLogin(v).problems) {
      ctx.addIssue({ code: 'custom', path: ['DEMO_LOGIN'], message });
    }
    for (const slot of ['PRIMARY', 'FALLBACK'] as const) {
      const provider = v[`AI_${slot}_PROVIDER`];
      const model = v[`AI_${slot}_MODEL`];
      const key = v[`AI_${slot}_API_KEY`];
      if (provider && (!model || !key)) {
        ctx.addIssue({ code: 'custom', path: [`AI_${slot}_PROVIDER`], message: `AI_${slot}_MODEL and AI_${slot}_API_KEY are required when AI_${slot}_PROVIDER is set` });
      }
      if (!provider && (model || key)) {
        ctx.addIssue({ code: 'custom', path: [`AI_${slot}_PROVIDER`], message: `AI_${slot}_PROVIDER is required when a ${slot.toLowerCase()} model or key is set` });
      }
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // Print variable names and reasons only - never values (they may be secrets).
  const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${problems}`);
  process.exit(1);
}

const raw = parsed.data;

export interface ProviderConfig {
  provider: z.infer<typeof providerName>;
  model: string;
  apiKey: string;
}

const providers: ProviderConfig[] = [];
if (raw.AI_PRIMARY_PROVIDER) {
  providers.push({ provider: raw.AI_PRIMARY_PROVIDER, model: raw.AI_PRIMARY_MODEL!, apiKey: raw.AI_PRIMARY_API_KEY! });
}
if (raw.AI_FALLBACK_PROVIDER) {
  providers.push({ provider: raw.AI_FALLBACK_PROVIDER, model: raw.AI_FALLBACK_MODEL!, apiKey: raw.AI_FALLBACK_API_KEY! });
}

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  demoLoginEnabled: decideDemoLogin(raw).enabled,
  // Secure cookies by default in production; explicit override for plain-http environments.
  cookieSecure: raw.COOKIE_SECURE ? raw.COOKIE_SECURE === 'true' : raw.NODE_ENV === 'production',
  aiProviders: providers,
};
