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

## Cloudflare Worker

`src/index.js` is a Cloudflare Worker that talks to Supabase. `GET /health` reports
whether the Worker can reach the Supabase project.

```bash
npm install
npm run dev      # local at http://localhost:8787
npm run deploy   # deploy with wrangler (needs `npx wrangler login`)
```

To deploy automatically from GitHub: Cloudflare dashboard → Workers & Pages → Create →
Import a repository → `saifaldin1992/wixa`. Every push then builds and deploys the Worker.
