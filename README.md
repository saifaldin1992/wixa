# wixa

Backed by the Supabase project `oswetqychjhfrwulzkjy` (Northeast Asia, Seoul).

## Setup

```bash
cp .env.example .env
npx supabase login
npx supabase link --project-ref oswetqychjhfrwulzkjy
```

## Database migrations

```bash
npx supabase migration new <name>   # create supabase/migrations/<timestamp>_<name>.sql
npx supabase db push                # apply pending migrations to the remote project
```

Local stack (requires Docker): `npx supabase start`.

## Connecting this repo in Supabase

Dashboard → Project Settings → Integrations → GitHub → connect `saifaldin1992/wixa`
and set the Supabase directory to `supabase`.

## Website & admin dashboard

- `public/index.html`, `styles.css`, `main.js`: the public bilingual (Arabic/English) site. All content, colors and fonts come from Supabase through `GET /api/site`.
- `public/admin/`: the admin dashboard at `/admin/`: visitor stats, colors, fonts and font size with live preview, all site text, projects, services, partners (with image uploads) and contact messages.
- `public/shared.js`: default content, fonts, icons and theme helpers used by both.
- `src/index.js`: Cloudflare Worker: `/api/site`, `/api/track` (anonymous daily-hashed visits), `/api/contact`, `/api/config`, `/health`; everything else is served from `public/`.

### First admin account

Open `/admin/`, choose "create admin account" and sign up. **The first account ever created becomes the admin**; any later sign-up has no rights.
Then, in Supabase → Authentication:
- add your site URL (e.g. `https://wixa.<you>.workers.dev`) to **URL Configuration** so the confirmation email links back to the site;
- optionally turn off **Allow new users to sign up** once the admin exists.

## Cloudflare Worker

```bash
npm install
npm run dev      # local at http://localhost:8787
npm run deploy   # deploy with wrangler (needs `npx wrangler login`)
```

To deploy automatically from GitHub: Cloudflare dashboard → Workers & Pages → Create →
Import a repository → `saifaldin1992/wixa`. Every push then builds and deploys the Worker.

## Environments: production and staging

| | Production | Staging (trial) |
|---|---|---|
| URL | https://wixa.dev | https://staging.wixa.dev |
| Git branch | `main` | `staging` |
| Cloudflare Worker | `wixa` | `wixa-staging` |
| Deploy command | `npx wrangler deploy` | `npx wrangler deploy --env staging` |
| Supabase project | `oswetqychjhfrwulzkjy` | `zwusczwhlshdgnoyesde` |

Staging shows a red "نسخة تجريبية" bar and is excluded from search engines.

**Workflow**
1. All changes land on `staging` first and auto-deploy to staging.wixa.dev.
2. New database migrations are applied to the staging Supabase project first.
3. To publish: merge `staging` into `main` (code), apply the same new migrations to the
   production project, and optionally copy content (site_settings, projects, services,
   partners) from staging to production.
