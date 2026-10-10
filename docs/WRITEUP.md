# Approach Write-up

BookLeaf Author Support & Communication Portal

## What I Prioritised

1. A ticket lifecycle that never depends on AI. A ticket is saved and acknowledged before any model call, so a provider outage cannot block an author or an admin.
2. Answers grounded in trusted data. PostgreSQL is the source of truth for every number (copies sold, royalty pending, dates, book status), and the Knowledge Base supplies policy. A confidently wrong royalty figure is worse than a slow reply, so AI assists a human reviewer and does not replace one.
3. Clear separation of concerns. The routing, scope, facts, templates and validation logic is pure code with no database or LLM imports, covered by 31 unit tests.

## AI Integration

- Classification: one structured call returns category, priority, intent and confidence. ISBN issues are floored at High priority, and admins can override both category and priority.
- Routing: the intent selects the evidence path. DB_ONLY questions are answered from a template with no LLM call, KB_ONLY and HYBRID questions make one grounded call, and insufficient information goes to manual review.
- Validation: a deterministic validator checks every draft against the database facts. A draft with a wrong amount, date or ISBN, or one that calls an unpublished book live, is withheld from the admin.
- Reliability: providers (Gemini, OpenAI, Anthropic) sit behind one interface. Retryable failures (timeouts, 5xx, 429) fall back to a second vendor. Configuration errors (bad key) are surfaced instead of retried. If all AI fails, the admin replies manually.
- Models: primary <provider / model>, fallback <provider / model or "none">. The task is short, structured and heavily grounded, so a small low-cost model is enough and keeps latency and spend low. A different vendor as fallback means one vendor's outage does not stop assistance.
- Cost: no LLM for database-only answers, minimal context per intent, one KB section per category, drafts cached by ticket state, no generation on page refresh, and every call logged in ai_runs with tokens and latency.

## Key Trade-offs

- Deterministic KB lookup instead of vector search. The Knowledge Base is seven short documents that map cleanly to categories, so a lookup is more accurate and cheaper than embeddings.
- In-process queue and rate limiter instead of Redis. This keeps infrastructure simple, but it assumes a single API instance and gives no durable job processing. Startup recovery re-queues interrupted work.
- Keyword-based scope and follow-up detection instead of an LLM call per message. It is cheap and predictable, but it can misread unusual wording, so admins review every draft.
- Attachments are UI-only, as the brief permits. Payout dates assume calendar quarters because the Knowledge Base does not define them.

## Evolving to Production

1. Infrastructure: a durable worker queue, shared rate limiting, and a Socket.IO adapter for multiple instances.
2. Files and operations: secure attachment storage with malware scanning, SLA timers with escalation rules, and admin workload views.
3. Knowledge: an editable Knowledge Base with review and approval.
4. AI quality: an evaluation set measuring classification accuracy, draft acceptance and edit rates, fallback frequency, latency and cost per provider.
5. Observability: distributed tracing, alerts on fallback rate, and per-provider budgets.