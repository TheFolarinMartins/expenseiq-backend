# ExpenseIQ Backend

Standalone Node.js, Express, and TypeScript API for ExpenseIQ.

## Start locally

See [HOW_TO_RUN.md](HOW_TO_RUN.md).

For persistent hosting, see [DEPLOYMENT.md](DEPLOYMENT.md).

Frontend developers should follow [FRONTEND_INTEGRATION.md](FRONTEND_INTEGRATION.md).

For the screen architecture, diagrams, and TanStack Query implementation, see [TANSTACK_QUERY_FRONTEND_GUIDE.md](TANSTACK_QUERY_FRONTEND_GUIDE.md).

For a simpler no-classes introduction, start with [BEGINNER_FRONTEND_GUIDE.md](BEGINNER_FRONTEND_GUIDE.md).

Download the beginner-friendly illustrated version: [ExpenseIQ Beginner Frontend Guide (PDF)](docs/ExpenseIQ_Beginner_Frontend_Guide.pdf).

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
