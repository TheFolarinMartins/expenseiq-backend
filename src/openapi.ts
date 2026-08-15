export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'ExpenseIQ API',
    version: '0.1.0',
    description:
      'Authenticated API for statement uploads, transaction review, and financial analytics.',
  },
  servers: [
    { url: 'http://localhost:4000', description: 'Local development' },
    {
      url: 'https://expenseiq-backend-iglc.onrender.com',
      description: 'Production on Render',
    },
  ],
  tags: [
    { name: 'Health' },
    { name: 'Authentication' },
    { name: 'Statements' },
    { name: 'Transactions' },
    { name: 'Categories' },
    { name: 'Dashboard' },
  ],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Error: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              fieldErrors: {
                type: 'object',
                additionalProperties: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
      User: {
        type: 'object',
        required: ['id', 'name', 'email', 'role', 'createdAt'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          role: { type: 'string', enum: ['USER', 'ADMIN'] },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      AuthResponse: {
        type: 'object',
        properties: {
          data: {
            type: 'object',
            required: ['user', 'token', 'refreshToken'],
            properties: {
              user: { $ref: '#/components/schemas/User' },
              token: { type: 'string', description: 'Short-lived bearer access token' },
              refreshToken: {
                type: 'string',
                description: 'Opaque rotating token; replace it after every refresh',
              },
            },
          },
        },
      },
      Statement: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          fileName: { type: 'string' },
          bankCode: { type: ['string', 'null'] },
          status: { type: 'string', enum: ['PROCESSING', 'NEEDS_BANK', 'PROCESSED', 'FAILED'] },
          failureCode: { type: ['string', 'null'] },
          failureMessage: { type: ['string', 'null'] },
          uploadedAt: { type: 'string', format: 'date-time' },
          processedAt: { type: ['string', 'null'], format: 'date-time' },
          transactionCount: { type: 'integer' },
        },
      },
      Transaction: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          statementId: { type: 'string' },
          bankCode: { type: 'string' },
          date: { type: 'string', format: 'date' },
          description: { type: 'string' },
          amountMinor: { type: 'integer', minimum: 0 },
          type: { type: 'string', enum: ['INCOME', 'EXPENSE'] },
          categoryId: { type: 'string' },
          confidenceScore: { type: 'integer' },
          reviewStatus: { type: 'string' },
        },
      },
      Dashboard: {
        type: 'object',
        properties: {
          currency: { type: 'string', enum: ['NGN'] },
          totalIncomeMinor: { type: 'integer' },
          totalExpensesMinor: { type: 'integer' },
          netCashFlowMinor: { type: 'integer' },
          transactionCount: { type: 'integer' },
          spendingByCategory: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                categoryId: { type: 'string' },
                amountMinor: { type: 'integer' },
              },
            },
          },
          spendingTrend: {
            type: 'array',
            description: 'Daily totals ordered by date ascending',
            items: {
              type: 'object',
              properties: {
                date: { type: 'string', format: 'date' },
                incomeMinor: { type: 'integer' },
                expensesMinor: { type: 'integer' },
                netCashFlowMinor: { type: 'integer' },
              },
            },
          },
          spendingByBank: {
            type: 'array',
            description: 'Bank totals ordered by expenses descending',
            items: {
              type: 'object',
              properties: {
                bankCode: { type: 'string' },
                incomeMinor: { type: 'integer' },
                expensesMinor: { type: 'integer' },
                netCashFlowMinor: { type: 'integer' },
                transactionCount: { type: 'integer' },
              },
            },
          },
          recentTransactions: {
            type: 'array',
            maxItems: 5,
            items: { $ref: '#/components/schemas/Transaction' },
          },
        },
      },
    },
  },
  paths: {
    '/health/live': {
      get: {
        tags: ['Health'],
        summary: 'Process liveness',
        responses: { '200': { description: 'Alive' } },
      },
    },
    '/health/ready': {
      get: {
        tags: ['Health'],
        summary: 'Service readiness',
        responses: { '200': { description: 'Ready' }, '503': { description: 'Not ready' } },
      },
    },
    '/api/auth/register': {
      post: {
        tags: ['Authentication'],
        summary: 'Register a user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'password'],
                properties: {
                  name: { type: 'string', minLength: 2 },
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Registered',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } },
            },
          },
          '409': { description: 'Email exists' },
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Authenticate',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Authenticated',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } },
            },
          },
          '401': { description: 'Invalid credentials' },
        },
      },
    },
    '/api/auth/me': {
      get: {
        tags: ['Authentication'],
        summary: 'Current user',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Current user' },
          '401': { description: 'Unauthenticated' },
        },
      },
    },
    '/api/auth/refresh': {
      post: {
        tags: ['Authentication'],
        summary: 'Rotate a refresh token and issue a new access token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: { refreshToken: { type: 'string', minLength: 32 } },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Tokens rotated',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } },
            },
          },
          '401': { description: 'Refresh token is invalid, expired, revoked, or already used' },
        },
      },
    },
    '/api/auth/logout': {
      post: {
        tags: ['Authentication'],
        summary: 'Logout client session',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { refreshToken: { type: 'string' } },
              },
            },
          },
        },
        responses: { '204': { description: 'Logged out' } },
      },
    },
    '/api/statements/upload': {
      post: {
        tags: ['Statements'],
        summary: 'Upload multiple PDF, image, Excel, or CSV statements',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['files'],
                properties: {
                  files: { type: 'array', items: { type: 'string', format: 'binary' } },
                },
              },
            },
          },
        },
        responses: {
          '207': { description: 'Per-file processing results' },
          '401': { description: 'Unauthenticated' },
        },
      },
    },
    '/api/statements': {
      get: {
        tags: ['Statements'],
        summary: 'List owned statements',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
        ],
        responses: { '200': { description: 'Paginated statements' } },
      },
    },
    '/api/statements/{id}': {
      get: {
        tags: ['Statements'],
        summary: 'Get owned statement',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Statement' }, '404': { description: 'Not found' } },
      },
      delete: {
        tags: ['Statements'],
        summary: 'Delete owned statement',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '204': { description: 'Deleted' }, '404': { description: 'Not found' } },
      },
    },
    '/api/statements/{id}/reprocess': {
      post: {
        tags: ['Statements'],
        summary: 'Select bank and reprocess',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['bankCode'],
                properties: {
                  bankCode: {
                    type: 'string',
                    enum: ['ACCESS', 'FIDELITY', 'FIRSTBANK', 'GTBANK', 'ZENITH'],
                  },
                  confirmReplaceCorrections: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Reprocessed' },
          '409': { description: 'Confirmation required' },
        },
      },
    },
    '/api/transactions': {
      get: {
        tags: ['Transactions'],
        summary: 'List and filter owned transactions',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'bank', in: 'query', schema: { type: 'string' } },
          { name: 'category', in: 'query', schema: { type: 'string' } },
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['INCOME', 'EXPENSE'] } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', maximum: 100 } },
        ],
        responses: { '200': { description: 'Paginated transactions' } },
      },
    },
    '/api/transactions/{id}': {
      patch: {
        tags: ['Transactions'],
        summary: 'Correct an owned transaction',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  date: { type: 'string', format: 'date' },
                  description: { type: 'string' },
                  amountMinor: { type: 'integer', minimum: 0 },
                  type: { type: 'string', enum: ['INCOME', 'EXPENSE'] },
                  categoryId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Updated transaction' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/api/categories': {
      get: {
        tags: ['Categories'],
        summary: 'List categories',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Categories' } },
      },
    },
    '/api/dashboard': {
      get: {
        tags: ['Dashboard'],
        summary: 'Get owned dashboard analytics',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'bank', in: 'query', schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Dashboard summary',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { data: { $ref: '#/components/schemas/Dashboard' } },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;
