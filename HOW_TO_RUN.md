# How to Run the ExpenseIQ Backend

The backend is a standalone Node.js application. All commands below run inside the `backend` folder.

## Requirements

- Node.js 22 or newer
- pnpm 10

## Install and configure

From the repository root:

```powershell
Set-Location backend
Copy-Item .env.example .env
```

Open `.env` and replace `JWT_SECRET` with a random value containing at least 32 characters. Then install dependencies:

```powershell
pnpm.cmd install
```

## Start development mode

```powershell
pnpm.cmd dev
```

The API starts at `http://localhost:4000` by default.

Interactive Swagger documentation is available at:

```text
http://localhost:4000/docs
```

The raw OpenAPI 3.1 document is available at:

```text
http://localhost:4000/openapi.json
```

Check it:

```powershell
curl.exe http://localhost:4000/health/live
curl.exe http://localhost:4000/health/ready
```

Expected response:

```json
{ "data": { "status": "ok" } }
```

## Test and verify

```powershell
pnpm.cmd test
pnpm.cmd lint
pnpm.cmd typecheck
pnpm.cmd build
```

Run the complete check:

```powershell
pnpm.cmd verify
```

## Run the compiled build

```powershell
pnpm.cmd build
pnpm.cmd start
```

## Current working scope

The backend currently includes the verified application foundation:

- validated environment configuration;
- Express application and server entry point;
- CORS and security headers;
- request IDs and redacted logging;
- safe error handling;
- liveness and readiness endpoints;
- automated tests.

## Persistence

The running backend creates:

- `storage/data.json` for users, statements, transactions, corrections, and categories;
- `storage/statements/*.pdf` for privately stored original statements.

Metadata writes use a serialized atomic temporary-file replacement. Statement files use opaque UUID keys and path-containment validation. Both locations are ignored by Git. This storage is suitable for local MVP development and demonstrations; use PostgreSQL plus encrypted object storage before production-scale financial data.

## API endpoints

All domain endpoints use the `/api` prefix:

```text
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/me
POST   /api/auth/logout
POST   /api/statements/upload
GET    /api/statements
GET    /api/statements/:id
POST   /api/statements/:id/reprocess
DELETE /api/statements/:id
GET    /api/transactions
PATCH  /api/transactions/:id
GET    /api/categories
GET    /api/dashboard
```

Except for registration and login, send `Authorization: Bearer <token>`.

Register from PowerShell:

```powershell
curl.exe -X POST http://localhost:4000/api/auth/register `
  -H "Content-Type: application/json" `
  -d '{"name":"Cathy","email":"cathy@example.com","password":"strong-password"}'
```

Upload statements:

```powershell
curl.exe -X POST http://localhost:4000/api/statements/upload `
  -H "Authorization: Bearer YOUR_TOKEN" `
  -F "files=@C:\path\statement.pdf"
```

## Statement processing limitation

Uploads validate, hash, deduplicate, store, and attempt bank detection from PDF bytes. The screenshots in the repository are not text-PDF parser fixtures, so this implementation does not fabricate extracted transactions from them. Unknown statements return `NEEDS_BANK`; manual reprocessing records a supported selected bank. Genuine anonymized text PDFs are still required before implementing reliable bank-specific transaction extraction.
