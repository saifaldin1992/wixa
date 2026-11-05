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
