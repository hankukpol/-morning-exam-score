# Morning Mock Admin

Next.js 14 App Router, Supabase Auth, Prisma, and Excel migration tooling for the morning mock exam management system described in `../PRD.md`.

## Stack

- Next.js 14 App Router
- Supabase (Auth + PostgreSQL)
- Prisma 6
- Tailwind CSS 3
- SheetJS (`xlsx`) for Excel parsing

## Phase 1 Included

- Admin shell with Supabase session check + Prisma `admin_users` RBAC
- Full Prisma schema from the PRD
- Student migration UI at `/admin/migration`
- Student migration API routes:
  - `POST /api/migration/students/preview`
  - `POST /api/migration/students/execute`
  - `POST /api/migration/students/rollback`
- Score file format inspection route:
  - `POST /api/migration/scores/preview`
- CLI helpers:
  - `npm run inspect:legacy`
  - `npm run import:legacy:students`

## Environment

Copy `.env.example` to `.env.local` and fill in your Supabase project values.

Required values:

- `DATABASE_URL`
- `DIRECT_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Optional for later admin automation:

- `SUPABASE_SERVICE_ROLE_KEY`

## Database Setup

1. Create a Supabase project.
2. Apply the initial Prisma SQL from `prisma/migrations/202603080001_init/migration.sql`.
3. Apply the Supabase policy SQL from `supabase/migrations/202603080002_admin_rls.sql`.
4. Create at least one Supabase Auth user.
5. Insert that user into `admin_users` with a `SUPER_ADMIN` role.

Generate Prisma client locally:

```bash
npm run db:generate
```

Push schema directly when you already trust the target database:

```bash
npm run db:push
```

## Run

```bash
npm install
npm run dev
```

## Build

On this Windows environment, production build needed a local `HOME/USERPROFILE` override to avoid protected junctions in the user profile:

```bash
cmd /c "set USERPROFILE=%CD%&& set HOME=%CD%&& npm run build"
```

## Legacy Import

Inspect the sample workbook:

```bash
npm run inspect:legacy
```

Dry run the student import:

```bash
npm run import:legacy:students
```

Apply the student import to the configured database:

```bash
npm run import:legacy:students -- --apply
```
