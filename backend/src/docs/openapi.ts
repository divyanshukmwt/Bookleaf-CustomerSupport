// OpenAPI 3 description served by Swagger UI at /api/v1/docs (raw JSON at /api/v1/openapi.json).
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const jsonBody = (schema: unknown) => ({ required: true, content: { 'application/json': { schema } } });
const ok = (description: string, schema?: unknown) => ({ description, ...(schema ? { content: { 'application/json': { schema } } } : {}) });
const err = (description: string) => ({ description, content: { 'application/json': { schema: ref('Error') } } });
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const common = { 400: err('Validation error'), 401: err('Not authenticated'), 403: err('Wrong role'), 404: err('Not found') };
const cookie = [{ cookieAuth: [] }];

export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'BookLeaf Author Support & Communication Portal API',
    version: '1.0.0',
    description:
      'Authentication is a secure HTTP-only session cookie set by POST /auth/login. Authors can only access their own data; admins can access operational data. Errors always use { error: { code, message, details?, requestId } }.',
  },
  servers: [{ url: '/api/v1' }],
  tags: [{ name: 'Auth' }, { name: 'Author' }, { name: 'Admin' }, { name: 'System' }],
  components: {
    securitySchemes: { cookieAuth: { type: 'apiKey', in: 'cookie', name: 'bookleaf_session' } },
    schemas: {
      Error: {
        type: 'object',
        properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' }, details: {}, requestId: { type: 'string' } } } },
      },
      User: { type: 'object', properties: { id: { type: 'string' }, email: { type: 'string' }, name: { type: 'string' }, role: { enum: ['AUTHOR', 'ADMIN'] }, authorId: { type: 'string', nullable: true } } },
      Message: { type: 'object', properties: { id: { type: 'string' }, ticketId: { type: 'string' }, senderRole: { enum: ['AUTHOR', 'ADMIN'] }, body: { type: 'string' }, createdAt: { type: 'string', format: 'date-time' } } },
      Draft: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          status: { enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] },
          source: { enum: ['AI', 'TEMPLATE'] },
          route: { enum: ['DB_ONLY', 'KB_ONLY', 'HYBRID', 'INSUFFICIENT_INFORMATION'] },
          body: { type: 'string', nullable: true },
          validationStatus: { enum: ['PASSED', 'FLAGGED', 'REJECTED'], nullable: true },
          validationIssues: { type: 'array', items: { type: 'object' } },
          error: { type: 'string', nullable: true },
        },
      },
      CreateTicket: {
        type: 'object',
        required: ['subject', 'description'],
        properties: { bookId: { type: 'string', format: 'uuid', nullable: true, description: 'null = General / Account Level' }, subject: { type: 'string', maxLength: 200 }, description: { type: 'string', maxLength: 5000 } },
      },
      AdminUpdate: {
        type: 'object',
        properties: {
          status: { enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] },
          category: { enum: ['ROYALTY_PAYMENTS', 'ISBN_METADATA', 'PRINTING_QUALITY', 'DISTRIBUTION_AVAILABILITY', 'PRODUCTION_UPDATES', 'GENERAL_INQUIRY'] },
          priority: { enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
          assignedToId: { oneOf: [{ type: 'string', enum: ['me'] }, { type: 'string', format: 'uuid' }], nullable: true },
        },
      },
      Body: { type: 'object', required: ['body'], properties: { body: { type: 'string', maxLength: 5000 } } },
    },
  },
  paths: {
    '/health': { get: { tags: ['System'], summary: 'Liveness + database check (public)', responses: { 200: ok('OK'), 503: err('Database unreachable') } } },
    '/auth/login': {
      post: {
        tags: ['Auth'], summary: 'Email/password login; sets the HTTP-only session cookie',
        requestBody: jsonBody({ type: 'object', required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string' } } }),
        responses: { 200: ok('Logged in', { type: 'object', properties: { user: ref('User') } }), 400: err('Validation error'), 401: err('Invalid email or password'), 429: err('Too many failed attempts') },
      },
    },
    '/auth/logout': { post: { tags: ['Auth'], summary: 'Clear the session cookie', responses: { 204: ok('Logged out') } } },
    '/auth/me': { get: { tags: ['Auth'], summary: 'Current user', security: cookie, responses: { 200: ok('Current user', { type: 'object', properties: { user: ref('User') } }), 401: err('Not authenticated') } } },
    '/books': { get: { tags: ['Author'], summary: "The logged-in author's books (including books still in production)", security: cookie, responses: { 200: ok('Books'), 401: err('Not authenticated'), 403: err('Authors only') } } },
    '/tickets': {
      get: { tags: ['Author'], summary: "The author's own tickets", security: cookie, responses: { 200: ok('Tickets'), 401: err('Not authenticated'), 403: err('Authors only') } },
      post: {
        tags: ['Author'], summary: 'Create a ticket (always succeeds independently of AI; classification runs asynchronously)', security: cookie,
        requestBody: jsonBody(ref('CreateTicket')),
        responses: { 201: ok('Created'), 400: err('Validation error'), 401: err('Not authenticated'), 403: err('Authors only'), 404: err('Book not found (or not owned by the author)') },
      },
    },
    '/tickets/{id}': { get: { tags: ['Author'], summary: 'Own ticket with its conversation (no internal notes / AI data)', security: cookie, parameters: [idParam], responses: { 200: ok('Ticket'), ...common } } },
    '/tickets/{id}/messages': {
      post: {
        tags: ['Author'], summary: 'Author follow-up reply. Reopens a RESOLVED ticket; 409 when CLOSED. Does not trigger AI.', security: cookie, parameters: [idParam],
        requestBody: jsonBody(ref('Body')), responses: { 201: ok('Saved'), 409: err('Ticket closed'), ...common },
      },
    },
    '/admin/tickets': {
      get: {
        tags: ['Admin'], summary: 'Ticket queue with filters. Default sort: priority (Critical first), then oldest first.', security: cookie,
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' }, description: 'Comma separated: OPEN,IN_PROGRESS,RESOLVED,CLOSED' },
          { name: 'category', in: 'query', schema: { type: 'string' } },
          { name: 'priority', in: 'query', schema: { type: 'string' } },
          { name: 'assignee', in: 'query', schema: { enum: ['me', 'unassigned'] } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'sort', in: 'query', schema: { enum: ['urgency', 'oldest', 'newest'] } },
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', maximum: 100 } },
        ],
        responses: { 200: ok('Page of tickets'), 400: err('Validation error'), 401: err('Not authenticated'), 403: err('Admins only') },
      },
    },
    '/admin/tickets/{id}': {
      get: { tags: ['Admin'], summary: 'Full ticket: conversation, internal notes, AI classification, author/book info', security: cookie, parameters: [idParam], responses: { 200: ok('Ticket'), ...common } },
      patch: { tags: ['Admin'], summary: 'Update status, override category/priority, assign (assignedToId "me" or null)', security: cookie, parameters: [idParam], requestBody: jsonBody(ref('AdminUpdate')), responses: { 200: ok('Updated ticket'), ...common } },
    },
    '/admin/tickets/{id}/messages': { post: { tags: ['Admin'], summary: 'Send a reply to the author (saved first, then pushed in real time)', security: cookie, parameters: [idParam], requestBody: jsonBody(ref('Body')), responses: { 201: ok('Sent'), 409: err('Ticket closed'), ...common } } },
    '/admin/tickets/{id}/notes': { post: { tags: ['Admin'], summary: 'Add an internal note (never visible to the author or sent to the AI)', security: cookie, parameters: [idParam], requestBody: jsonBody({ type: 'object', required: ['body'], properties: { body: { type: 'string', maxLength: 2000 } } }), responses: { 201: ok('Created'), ...common } } },
    '/admin/tickets/{id}/draft': { get: { tags: ['Admin'], summary: 'Get the AI/template draft. Reuses a cached draft when the cache key is unchanged; generates asynchronously otherwise (poll while status = PROCESSING). Returns draft: null when the last message is the admin\'s own reply (nothing new to answer).', security: cookie, parameters: [idParam], responses: { 200: ok('Draft', { type: 'object', properties: { draft: ref('Draft') } }), ...common } } },
    '/admin/tickets/{id}/draft/regenerate': { post: { tags: ['Admin'], summary: 'Explicitly regenerate the draft (the only way to force a new LLM call)', security: cookie, parameters: [idParam], responses: { 202: ok('Generation started'), ...common } } },
    '/admin/tickets/{id}/classify': { post: { tags: ['Admin'], summary: 'Retry AI classification (e.g. after an AI outage)', security: cookie, parameters: [idParam], responses: { 202: ok('Queued'), ...common } } },
  },
};
