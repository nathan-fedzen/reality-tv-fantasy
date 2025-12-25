
# Updated workflow + chat handoff (for this repo structure)

## ✅ Start of Development Day (Local Setup)

### 1) Start local dev (Windows / PowerShell)

```powershell
$env:NODE_TLS_REJECT_UNAUTHORIZED="0"
npm run dev
```

### 2) If Prisma types act weird

```bash
npx prisma generate
```

### 3) Sanity check pages

* `/login` loads without Prisma/NextAuth adapter errors
* `/dashboard` redirects to `/login` when logged out
* league pages load for the correct user

---

## 🔐 Auth & Dev Bypass (Source of truth files)

### Auth routes + session behavior

* NextAuth route:

  * `src/app/api/auth/[...nextauth]/route.ts`
* Auth helper:

  * `src/lib/auth.ts`

    * `getCurrentUser()` (used for server-side gating)
    * dev bypass controlled by `.env.local`

### Dev bypass env flags

In `.env.local`:

```env
DEV_AUTH_BYPASS=true|false
DEV_AUTH_EMAIL=dev@nathan.local
NEXT_PUBLIC_DEV_AUTH_BYPASS=true|false
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

> Reminder: If bypass is ON, logout won’t “feel” real because server-side auth always returns a user.

---

## 🧠 Start of a NEW Chat with ChatGPT (Context Snapshot)

When starting a new chat, paste this:

```
Context Snapshot:
- Repo: reality-tv-fantasy-app (Next.js App Router, Server Components)
- Prisma + PostgreSQL
- NextAuth magic link using PrismaAdapter
- Auth helpers: src/lib/auth.ts (getCurrentUser)
- NextAuth route: src/app/api/auth/[...nextauth]/route.ts
- Leagues API:
  - POST create: src/app/api/leagues/route.ts
  - DELETE league: src/app/api/leagues/[id]/route.ts
  - Invite mgmt: src/app/api/leagues/[id]/invite/route.ts
- Join flow: src/app/join/[token]/page.tsx
- League page: src/app/leagues/[id]/page.tsx
- Dashboard: src/app/dashboard/page.tsx
- Components live in: src/components/*
- Windows + PowerShell:
  $env:NODE_TLS_REJECT_UNAUTHORIZED="0"; npm run dev
- Domain: realitytvfantasy.app (Resend set up / in progress)
```

---

## 📂 File Structure Snapshot (paste when debugging)

Key project paths:

### Pages

* Home: `src/app/page.tsx`
* Dashboard: `src/app/dashboard/page.tsx`
* Login: `src/app/login/page.tsx` (+ `ui.tsx`)
* Verify: `src/app/verify/page.tsx`
* Create league: `src/app/leagues/new/page.tsx` (+ `ui.tsx`)
* League detail: `src/app/leagues/[id]/page.tsx`
* Join by token: `src/app/join/[token]/page.tsx`

### API Routes

* NextAuth: `src/app/api/auth/[...nextauth]/route.ts`
* Create league: `src/app/api/leagues/route.ts`
* Delete league: `src/app/api/leagues/[id]/route.ts`
* Invite management: `src/app/api/leagues/[id]/invite/route.ts`

### Components

* `src/components/copy-button.tsx`
* `src/components/logout-button.tsx`
* `src/components/delete-league-button.tsx`
* `src/components/invite-controls.tsx`
* `src/components/dev-mode-banner.tsx`
* UI primitives: `src/components/ui/*`

### Lib

* Prisma client: `src/lib/prisma.ts`
* Auth helpers: `src/lib/auth.ts`

### Prisma schema/migrations

* `prisma/schema.prisma`
* `prisma/migrations/*`

---

## ✅ End of Development Day (MANDATORY Chat Handoff)

Before ending the day, paste this:

```
End of Day Recap:
- What I built today:
- What works now (routes/pages):
- What I changed (file paths):
- What’s next (1-3 tasks):
- Any env requirements (TLS, bypass):
```

### Example

```
End of Day Recap:
- Implemented join flow + logout button
- Invite management (enable/disable/regenerate) works
- Updated league page to show invite status + controls
- Files touched:
  - src/app/join/[token]/page.tsx
  - src/components/logout-button.tsx
  - src/app/leagues/[id]/page.tsx
  - src/app/api/leagues/[id]/invite/route.ts
- Next: start Drag Race picks system (Queens + Entry/Picks models)
- Local start: $env:NODE_TLS_REJECT_UNAUTHORIZED="0"; npm run dev
```

---

## ❌ Things NOT to do

* Don’t set `NODE_ENV` manually.
* Don’t put event handlers inside Server Components.
* Don’t assume picks/permissions are enforced client-side (always server).

---

## 🧭 Debug Order When Something Breaks

1. Did you start dev with TLS disabled?
2. Did you regenerate Prisma client?
3. Is `DEV_AUTH_BYPASS` set correctly for the test?
4. Is it a Server vs Client boundary issue?
5. Did you paste the snapshot to ChatGPT?


