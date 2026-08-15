# Deploy ExpenseIQ Backend (Render + Supabase)

The API is configured for a Render web service, Supabase PostgreSQL, and a private Supabase Storage bucket.

## 1. Create Supabase resources

1. Create a Supabase project.
2. Click **Connect**, select **Shared Pooler → Session mode**, and copy its PostgreSQL connection string. It must use a host similar to `aws-0-REGION.pooler.supabase.com`, the username `postgres.PROJECT_REF`, and port `5432`. Insert your URL-encoded database password.
   - Do **not** use the direct `db.PROJECT_REF.supabase.co:5432` URL on Render. Supabase free-tier direct connections are IPv6-only and can fail with `ENETUNREACH`.
   - Do not use transaction mode on port `6543` for this persistent Express service; session mode is the appropriate pooler mode.
3. In **Project Settings → API**, copy the project URL and service-role key.
4. Keep the service-role key private. Never put it in frontend code, Git, or chat.

The API creates its `expenseiq_app_state` table and private `expenseiq-statements` bucket on first startup.

## 2. Deploy from GitHub on Render

1. Sign in to Render and choose **New → Blueprint**.
2. Connect `TheFolarinMartins/expenseiq-backend`.
3. Render reads `render.yaml` and creates the web service.
4. Enter the requested environment variables:
   - `DATABASE_URL`: the Supabase **Shared Pooler, Session mode** connection string on port `5432`.
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
