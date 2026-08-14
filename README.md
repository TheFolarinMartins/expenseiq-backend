# ExpenseIQ Backend

Standalone Node.js, Express, and TypeScript API for ExpenseIQ.

## Start locally

See [HOW_TO_RUN.md](HOW_TO_RUN.md).

```powershell
Copy-Item .env.example .env
pnpm.cmd install
pnpm.cmd dev
```

- API: `http://localhost:4000`
- Swagger UI: `http://localhost:4000/docs`
- OpenAPI: `http://localhost:4000/openapi.json`
- Health: `http://localhost:4000/health/live`

Run all checks with `pnpm.cmd verify`.
