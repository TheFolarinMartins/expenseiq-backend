# ExpenseIQ Frontend Integration Guide

This guide explains how a frontend application should connect to the ExpenseIQ API. The examples use TypeScript and the native `fetch` API, so they work with React, Vue, Svelte, or plain browser code.

## 1. Backend URLs

Use one environment variable for the backend origin.

```env
# Vite
VITE_API_URL=http://localhost:4000

# Next.js (browser-accessible variable)
NEXT_PUBLIC_API_URL=http://localhost:4000
```

For production, replace the value with the Render URL and set backend `CORS_ORIGIN` to the exact frontend origin. Do not add a trailing `/`.

Useful backend pages:

- Swagger UI: `${API_URL}/docs`
- OpenAPI JSON: `${API_URL}/openapi.json`
- Health: `${API_URL}/health/ready`

The frontend must never receive `DATABASE_URL`, `JWT_SECRET`, or `SUPABASE_SERVICE_ROLE_KEY`.

## 2. Suggested frontend structure

```text
src/
  api/
    client.ts
    types.ts
    auth.ts
    statements.ts
    transactions.ts
    categories.ts
    dashboard.ts
  auth/
    auth-store.ts
    protected-route.tsx
  features/
    auth/
    statements/
    transactions/
    dashboard/
```

Keep HTTP calls in `src/api`. UI components should call these functions instead of calling `fetch` directly.

## 3. Shared types

Create `src/api/types.ts`:

```ts
export type BankCode = 'ACCESS' | 'FIDELITY' | 'FIRSTBANK' | 'GTBANK' | 'ZENITH';
export type StatementStatus = 'PROCESSING' | 'NEEDS_BANK' | 'PROCESSED' | 'FAILED';
export type TransactionType = 'INCOME' | 'EXPENSE';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'USER' | 'ADMIN';
  createdAt: string;
}

export interface Statement {
  id: string;
  fileName: string;
  bankCode: BankCode | null;
  status: StatementStatus;
  failureCode: string | null;
  failureMessage: string | null;
  uploadedAt: string;
  processedAt: string | null;
  transactionCount: number;
}

export interface Transaction {
  id: string;
  statementId: string;
  userId: string;
  bankCode: BankCode;
  date: string;
  description: string;
  amountMinor: number;
  type: TransactionType;
  balanceMinor: number | null;
  categoryId: string;
  confidenceScore: number;
  reviewStatus: 'OK' | 'REVIEW_REQUIRED' | 'USER_CORRECTED';
  isUserCorrected: boolean;
  rawDescription: string;
  rawAmount: string;
  rawDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  code: string;
  name: string;
  displayOrder: number;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fieldErrors?: Record<string, string[]>;
  };
}

export interface Dashboard {
  currency: 'NGN';
  totalIncomeMinor: number;
  totalExpensesMinor: number;
  netCashFlowMinor: number;
  transactionCount: number;
  spendingByCategory: Array<{ categoryId: string; amountMinor: number }>;
  spendingTrend: Array<{
    date: string;
    incomeMinor: number;
    expensesMinor: number;
    netCashFlowMinor: number;
  }>;
  spendingByBank: Array<{
    bankCode: BankCode;
    incomeMinor: number;
    expensesMinor: number;
    netCashFlowMinor: number;
    transactionCount: number;
  }>;
  recentTransactions: Transaction[];
}
```

All money values use **minor units**. For NGN, `125050` means `₦1,250.50`. Never use floating-point naira values in API requests.

```ts
export function formatNaira(amountMinor: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
  }).format(amountMinor / 100);
}
```

## 4. Reusable API client

Create `src/api/client.ts`:

```ts
import type { ApiErrorBody } from './types';

const API_URL = import.meta.env.VITE_API_URL as string;
const TOKEN_KEY = 'expenseiq_access_token';
const REFRESH_TOKEN_KEY = 'expenseiq_refresh_token';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export const tokenStore = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  getRefresh: () => sessionStorage.getItem(REFRESH_TOKEN_KEY),
  setPair: (token: string, refreshToken: string) => {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  },
  clear: () => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = tokenStore.get();
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');

  // Do not set Content-Type for FormData; the browser adds its multipart boundary.
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Unable to reach the ExpenseIQ server.');
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const body = payload as ApiErrorBody | null;
    throw new ApiError(
      response.status,
      body?.error.code ?? 'HTTP_ERROR',
      body?.error.message ?? 'The request failed.',
      body?.error.fieldErrors,
    );
  }
  return payload as T;
}

export function queryString(values: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
}
```

`sessionStorage` is a simple current implementation. It protects the token from being retained after the browser session, but it does not eliminate XSS risk. Avoid rendering unsanitized HTML and use a strict Content Security Policy. The backend currently returns a 15-minute access token and does not yet implement refresh tokens.

## 5. Authentication API

Create `src/api/auth.ts`:

```ts
import { apiRequest, tokenStore } from './client';
import type { User } from './types';

interface AuthResponse {
  data: { user: User; token: string; refreshToken: string };
}

export async function register(input: {
  name: string;
  email: string;
  password: string;
}): Promise<User> {
  const result = await apiRequest<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  tokenStore.setPair(result.data.token, result.data.refreshToken);
  return result.data.user;
}

export async function login(email: string, password: string): Promise<User> {
  const result = await apiRequest<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  tokenStore.setPair(result.data.token, result.data.refreshToken);
  return result.data.user;
}

export async function getCurrentUser(): Promise<User> {
  return (await apiRequest<{ data: User }>('/api/auth/me')).data;
}

export async function refreshSession(): Promise<User> {
  const refreshToken = tokenStore.getRefresh();
  if (!refreshToken) throw new Error('No refresh token is available.');
  const result = await apiRequest<AuthResponse>('/api/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
  tokenStore.setPair(result.data.token, result.data.refreshToken);
  return result.data.user;
}

export async function logout(): Promise<void> {
  const refreshToken = tokenStore.getRefresh();
  try {
    await apiRequest<void>('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: refreshToken ?? undefined }),
    });
  } finally {
    tokenStore.clear();
  }
}
```

When a protected request returns 401, call `refreshSession()` once and retry the original request once. Use one shared in-flight refresh promise so simultaneous 401 responses cannot reuse the same rotating token. Never refresh or retry `/api/auth/refresh` itself. If refresh fails, clear both tokens and redirect to login.

Application startup flow:

1. If there is no token, show the public login/register routes.
2. If there is a token, call `getCurrentUser()`.
3. If it succeeds, populate the auth store and show protected routes.
4. If it returns 401, clear auth state and redirect to login.
5. On 401, attempt one refresh and retry; if it fails, show “Your session expired” and redirect to login.

Logout revokes the submitted refresh token and clears both client tokens. The already-issued access token remains valid only until its short expiry.

## 6. Statement APIs

Create `src/api/statements.ts`:

```ts
import { apiRequest, queryString } from './client';
import type { BankCode, PageMeta, Statement } from './types';

export interface UploadItem {
  fileName: string;
  statementId: string | null;
  status: 'PROCESSED' | 'NEEDS_BANK' | 'DUPLICATE' | 'FAILED';
  bankCode: BankCode | null;
  transactionCount: number;
  error: { code: string; message: string } | null;
}

export interface UploadResult {
  data: {
    summary: {
      total: number;
      processed: number;
      needsBank: number;
      duplicate: number;
      failed: number;
    };
    items: UploadItem[];
  };
}

export async function uploadStatements(files: File[]): Promise<UploadResult> {
  const form = new FormData();
  files.forEach((file) => form.append('files', file));
  return apiRequest<UploadResult>('/api/statements/upload', {
    method: 'POST',
    body: form,
  });
}

export async function listStatements(page = 1, pageSize = 20) {
  return apiRequest<{ data: Statement[]; meta: PageMeta }>(
    `/api/statements${queryString({ page, pageSize })}`,
  );
}

export async function getStatement(id: string): Promise<Statement> {
  return (await apiRequest<{ data: Statement }>(`/api/statements/${id}`)).data;
}

export async function reprocessStatement(
  id: string,
  bankCode: BankCode,
  confirmReplaceCorrections = false,
): Promise<Statement> {
  return (
    await apiRequest<{ data: Statement }>(`/api/statements/${id}/reprocess`, {
      method: 'POST',
      body: JSON.stringify({ bankCode, confirmReplaceCorrections }),
    })
  ).data;
}

export async function deleteStatement(id: string): Promise<void> {
  await apiRequest<void>(`/api/statements/${id}`, { method: 'DELETE' });
}
```

Upload UI rules:

- Accept `.pdf` and `application/pdf` only.
- Maximum 10 files per request.
- Maximum 10 MiB per file and 50 MiB per batch.
- Treat HTTP `207 Multi-Status` as success. Inspect every `data.items` entry because some files can succeed while others fail.
- For `NEEDS_BANK`, show a supported-bank selector and call `reprocessStatement`.
- For `DUPLICATE`, link to the returned existing `statementId`.
- Never manually set the multipart `Content-Type` header.

If reprocessing returns `409 REPROCESS_CONFIRMATION_REQUIRED`, display a confirmation dialog. Only retry with `confirmReplaceCorrections: true` after the user explicitly agrees that corrected transactions may be replaced.

## 7. Transaction APIs

Create `src/api/transactions.ts`:

```ts
import { apiRequest, queryString } from './client';
import type { BankCode, PageMeta, Transaction, TransactionType } from './types';

export interface TransactionFilters {
  bank?: BankCode;
  category?: string;
  type?: TransactionType;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function listTransactions(filters: TransactionFilters = {}) {
  return apiRequest<{ data: Transaction[]; meta: PageMeta }>(
    `/api/transactions${queryString(filters)}`,
  );
}

export async function updateTransaction(
  id: string,
  changes: Partial<
    Pick<Transaction, 'date' | 'description' | 'amountMinor' | 'type' | 'categoryId'>
  >,
): Promise<Transaction> {
  return (
    await apiRequest<{ data: Transaction }>(`/api/transactions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
    })
  ).data;
}
```

Use `YYYY-MM-DD` for transaction dates. Send at least one changed field. Debounce search input by roughly 300–500 ms, reset `page` to 1 when filters change, and use `meta.total` to calculate page controls.

## 8. Categories and dashboard

Create `src/api/categories.ts`:

```ts
import { apiRequest } from './client';
import type { Category } from './types';

export async function listCategories(): Promise<Category[]> {
  return (await apiRequest<{ data: Category[] }>('/api/categories')).data;
}
```

Create `src/api/dashboard.ts`:

```ts
import { apiRequest, queryString } from './client';
import type { BankCode, Dashboard } from './types';

export async function getDashboard(bank?: BankCode): Promise<Dashboard> {
  return (await apiRequest<{ data: Dashboard }>(`/api/dashboard${queryString({ bank })}`)).data;
}
```

Load categories once after authentication and cache them in application state. `spendingTrend` is ordered by date ascending, `spendingByBank` is ordered by expenses descending, and `spendingByCategory` is ordered by amount descending. These arrays are empty when the user has no transactions, so empty-state UI is still required.

## 9. Complete endpoint checklist

| Method | Path                            | Authentication | Frontend use                      |
| ------ | ------------------------------- | -------------- | --------------------------------- |
| GET    | `/health/live`                  | No             | Basic service check               |
| GET    | `/health/ready`                 | No             | Database/service readiness        |
| POST   | `/api/auth/register`            | No             | Create account and store token    |
| POST   | `/api/auth/login`               | No             | Sign in and store token           |
| POST   | `/api/auth/refresh`             | No             | Rotate tokens and renew session   |
| GET    | `/api/auth/me`                  | Bearer         | Restore authenticated session     |
| POST   | `/api/auth/logout`              | Bearer         | End the client session            |
| POST   | `/api/statements/upload`        | Bearer         | Upload one or more PDFs           |
| GET    | `/api/statements`               | Bearer         | Paginated statement history       |
| GET    | `/api/statements/:id`           | Bearer         | Statement details                 |
| POST   | `/api/statements/:id/reprocess` | Bearer         | Select bank and retry processing  |
| DELETE | `/api/statements/:id`           | Bearer         | Delete statement and related data |
| GET    | `/api/transactions`             | Bearer         | Paginated/filterable transactions |
| PATCH  | `/api/transactions/:id`         | Bearer         | Correct transaction fields        |
| GET    | `/api/categories`               | Bearer         | Category options and labels       |
| GET    | `/api/dashboard`                | Bearer         | User-owned analytics              |

Users can access only their own statements and transactions. A resource belonging to another user returns 404 rather than revealing that it exists.

## 10. Error handling

The standard error shape is:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Check the submitted fields.",
    "fieldErrors": {
      "email": ["Invalid email address"]
    }
  }
}
```

Recommended UI behavior:

| Status/code                             | Behavior                                                           |
| --------------------------------------- | ------------------------------------------------------------------ |
| `0 / NETWORK_ERROR`                     | Show offline/server-unreachable state with Retry                   |
| `400 / VALIDATION_ERROR`                | Place `fieldErrors` beside form controls                           |
| `401`                                   | Clear token, show session-expired message, redirect to login       |
| `404`                                   | Show not-found state; do not assume ownership                      |
| `409 / CONFLICT`                        | Show the server message, such as existing email                    |
| `409 / REPROCESS_CONFIRMATION_REQUIRED` | Ask user before retrying with confirmation                         |
| `413`                                   | Explain that upload size limits were exceeded                      |
| `429`                                   | Disable immediate retry and use a short backoff                    |
| `500`                                   | Show a generic failure and allow Retry; do not expose stack traces |

Do not branch only on human-readable messages. Use `error.code` because messages can change.

## 11. React Query example (optional)

If the frontend uses TanStack Query:

```ts
const statementsQuery = useQuery({
  queryKey: ['statements', page, pageSize],
  queryFn: () => listStatements(page, pageSize),
});

const uploadMutation = useMutation({
  mutationFn: uploadStatements,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['statements'] }),
});

const updateTransactionMutation = useMutation({
  mutationFn: ({ id, changes }: { id: string; changes: Parameters<typeof updateTransaction>[1] }) =>
    updateTransaction(id, changes),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  },
});
```

Invalidate statements after upload, reprocess, or delete. Invalidate transactions and dashboard after transaction corrections or statement changes.

## 12. Recommended implementation order

1. Configure the environment URL and confirm `/health/ready`.
2. Add shared types, `apiRequest`, `ApiError`, and the token store.
3. Build register, login, auth restoration, protected routing, and logout.
4. Build PDF selection, client-side limits, upload progress state, and per-file results.
5. Build statement history, details, manual bank selection, and deletion confirmation.
6. Load categories and build transaction filters, pagination, and correction forms.
7. Build dashboard cards and empty states.
8. Add loading skeletons, retry states, session-expiry handling, and accessible form errors.
9. Test against Swagger and then execute the acceptance checklist below.

## 13. Acceptance checklist

- A new user can register and remains authenticated during the browser session.
- A returning user can log in and `/api/auth/me` restores their profile.
- An expired/invalid token redirects safely to login.
- PDF selection prevents obvious invalid type/size submissions.
- Mixed upload results display each file independently, including HTTP 207.
- `NEEDS_BANK`, duplicate, and failed uploads have distinct actions.
- Statement list pagination uses response metadata.
- Users must confirm destructive statement deletion.
- Transaction filters serialize correctly and reset pagination.
- Money is formatted from minor units and edited back into integer minor units.
- Transaction updates refresh the transaction list and dashboard.
- Empty dashboards and empty transaction lists render intentionally.
- Network, validation, authorization, not-found, conflict, and server errors have usable UI states.
- No backend secret appears in frontend source, browser storage, requests, or build-time public variables.

## 14. Current backend limitations

- Refresh tokens are opaque, rotate after every use, and expire after 30 days by default. The frontend must prevent concurrent refresh calls from reusing one token.
- Logout revokes the current refresh token; an issued access JWT remains valid until its short expiry.
- Uploaded PDFs are validated, deduplicated, stored, and assigned a bank. Reliable bank-specific transaction extraction still requires anonymized text-PDF fixtures and parser implementation.
- Dashboard aggregation arrays are empty until the user has stored transactions.

These limitations should be reflected honestly in the UI rather than simulated with fabricated transactions.
