## Migration steps (repo on GitHub, new Supabase project ready)

Do these locally on your machine, not in Lovable.

### 1. Clone and install
```bash
git clone <your-github-repo>
cd <repo>
bun install    # or npm install
```

### 2. Link Supabase CLI to your new project
Get your project ref from Supabase dashboard → Project Settings → General (`abc123xyz...`).

```bash
npx supabase login
npx supabase link --project-ref <YOUR_PROJECT_REF>
```

### 3. Push the schema
```bash
npx supabase db push
```
This runs everything under `supabase/migrations/` against your new database: tables (`events`, `guests`, `photos`, `reactions`, `comments`, `album_viewers`), RLS policies, grants.

Verify in Supabase dashboard → Table Editor that all 6 tables exist.

### 4. Create the storage bucket
Supabase dashboard → Storage → New bucket:
- Name: `event-photos`
- Public: **off** (private)

Storage RLS policies should have come from the migrations. If not, check `supabase/migrations/` for the storage policy file and re-run just that one via SQL editor.

### 5. Configure auth
Dashboard → Authentication → Providers:
- **Email**: enabled. Under Email settings, turn **off** "Confirm email" to match current behavior (frictionless host signup).
- **Site URL** (Authentication → URL Configuration): add `http://localhost:5173` for dev and your future Vercel URL once you have it.

### 6. Get your keys
Dashboard → Project Settings → API. Copy:
- Project URL
- `anon` / `publishable` key
- `service_role` key (secret — server only)
- Project ref (the subdomain)

### 7. Update `.env` locally
```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key>
VITE_SUPABASE_PROJECT_ID=<ref>
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

### 8. Regenerate types
```bash
npx supabase gen types typescript --linked > src/integrations/supabase/types.ts
```

### 9. Simplify the client files
The Lovable-managed files may reference Lovable Cloud specifics. Once outside Lovable, replace them with standard versions:

**`src/integrations/supabase/client.ts`**
```ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
)
```

**`src/integrations/supabase/client.server.ts`**
```ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

export const supabaseAdmin = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)
```

Keep `auth-middleware.ts` and `auth-attacher.ts` as-is unless they reference Lovable-specific paths — check and adjust env var names to match `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`.

### 10. Generate VAPID keys (for push notifications)
```bash
npx web-push generate-vapid-keys
```
Save the public key as `VITE_VAPID_PUBLIC_KEY` and private as `VAPID_PRIVATE_KEY` in `.env`. Update wherever the current code references the old VAPID public key.

### 11. Run locally
```bash
bun run dev
```
Smoke test: signup as host → create event → open in another browser → join → take a photo → publish album.

### 12. Deploy to Vercel
- Vercel → Import Project → pick the GitHub repo.
- Framework preset: **Other** (TanStack Start).
- The project currently builds for Cloudflare Workers. For Vercel, in `vite.config.ts` change the TanStack Start target from `'cloudflare-module'` to `'vercel'`, then `bun install` again.
- Set all env vars from step 7 + VAPID keys in Vercel Project Settings → Environment Variables.
- Deploy.
- Once deployed, add the Vercel URL to Supabase → Auth → URL Configuration → Site URL and Redirect URLs.

### Known gotchas
- **Cloudflare → Vercel adapter swap**: if `vite.config.ts` has `target: 'cloudflare-module'`, change to `target: 'vercel'`. If it uses a specific server preset package, swap it. Vercel build logs will tell you clearly if this is wrong.
- **Types drift**: after any future migration, re-run step 8.
- **Password hashes**: any test host accounts in Lovable Cloud don't come across — sign up fresh on the new project.
- **From here on**: Lovable's editor stops being the source of truth. Do all future work in Claude Code / Cursor / locally. The Lovable ↔ GitHub sync will still push edits from Lovable, but any DB change made via Lovable would target Lovable Cloud (empty for you now), not your project.

Want me to actually make any of these edits inside Lovable before you continue locally (e.g. simplify the client files, swap the Vercel adapter in `vite.config.ts`)? Or is this all you needed?
