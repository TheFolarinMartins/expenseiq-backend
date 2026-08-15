# Deploy ExpenseIQ Backend (Render + Supabase)

The API is configured for a Render web service, Supabase PostgreSQL, and a private Supabase Storage bucket.

## 1. Create Supabase resources

1. Create a Supabase project.
2. In **Project Settings → Database**, copy the pooled PostgreSQL connection string and insert your database password.
3. In **Project Settings → API**, copy the project URL and service-role key.
4. Keep the service-role key private. Never put it in frontend code, Git, or chat.

The API creates its `expenseiq_app_state` table and private `expenseiq-statements` bucket on first startup.

## 2. Deploy from GitHub on Render

1. Sign in to Render and choose **New → Blueprint**.
2. Connect `TheFolarinMartins/expenseiq-backend`.
3. Render reads `render.yaml` and creates the web service.
4. Enter the requested environment variables:
   - `DATABASE_URL`: the Supabase pooled PostgreSQL connection string.
   - `SUPABASE_URL`: the Supabase project URL.
   - `SUPABASE_SERVICE_ROLE_KEY`: the secret service-role key.
   - `CORS_ORIGIN`: the deployed frontend origin, such as `https://expenseiq.example.com`.
5. Deploy and wait for `/health/ready` to return HTTP 200.

## 3. Verify

Open these URLs, replacing the hostname with the Render service URL:

- `https://YOUR-SERVICE.onrender.com/health/live`
- `https://YOUR-SERVICE.onrender.com/health/ready`
- `https://YOUR-SERVICE.onrender.com/docs`
- `https://YOUR-SERVICE.onrender.com/openapi.json`

Register a test account in Swagger, copy its JWT token, click **Authorize**, and test the protected endpoints. Use only synthetic statements during deployment testing.

## Local production-mode smoke test

Set the same variables in a local `.env`, add a strong `JWT_SECRET`, then run:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd build
pnpm.cmd start
```

Do not commit `.env`.
