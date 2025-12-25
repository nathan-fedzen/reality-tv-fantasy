
# 🛠️ Development Workflow & Chat Handoff Guide

This document exists to:

* Prevent recurring local dev issues (TLS, Prisma, auth)
* Keep ChatGPT context aligned across sessions
* Avoid re-debugging solved problems
* Make starting and ending dev days fast and consistent

This project uses:

* Next.js App Router (Server Components)
* Prisma + PostgreSQL
* NextAuth (magic link) with PrismaAdapter
* Windows + PowerShell local dev

---

## 🚀 Start of Development Day (Local Setup)

### 1️⃣ Start local dev **the correct way**

**PowerShell (Windows):**

```powershell
$env:NODE_TLS_REJECT_UNAUTHORIZED="0"
npm run dev
```

**Why this is required**

* Allows Prisma + NextAuth to connect to Postgres with a self-signed cert
* Prevents `adapter_error_getSessionAndUser`
* Must be set **every new terminal session**

> ⚠️ Never do this in production.

---

### 2️⃣ If Prisma types act weird

Run:

```bash
npx prisma generate
```

**Fixes**

* Stale Prisma client
* Incorrect nullability / missing fields
* TypeScript errors after schema changes

---

### 3️⃣ Quick sanity check

Confirm:

* Dev server boots without Prisma TLS errors
* `/login` loads
* Dev Mode banner appears **only if bypass is enabled**

---

## 🔐 Auth Mode Awareness (VERY IMPORTANT)

### Dev Auth Bypass

Controlled via `.env.local`:

```env
DEV_AUTH_BYPASS=true
NEXT_PUBLIC_DEV_AUTH_BYPASS=true
```

**Behavior**

* Server-side auth is bypassed
* No magic link required
* Client `useSession()` may still show logged out (expected)

To test real auth:

```env
DEV_AUTH_BYPASS=false
NEXT_PUBLIC_DEV_AUTH_BYPASS=false
```

➡️ **Restart dev server after changing**

---

## 🧠 Start of a NEW Chat with ChatGPT (Context Snapshot)

When starting a new chat, **paste this first**:

```
Context Snapshot:
- Next.js App Router (Server Components)
- Prisma + PostgreSQL
- NextAuth magic link auth (PrismaAdapter)
- No middleware.ts
- Auth handled via getCurrentUser() in lib/auth.ts
- Dev auth bypass exists (DEV_AUTH_BYPASS)
- CopyButton is a client component
- League pages are server components
- Invite links are /join/[token]
- Windows + PowerShell
- NODE_TLS_REJECT_UNAUTHORIZED=0 required for local dev
```

---

## 📂 File Structure Snapshot (Paste When Relevant)

```
Key files:
- src/lib/auth.ts
- src/app/api/auth/[...nextauth]/route.ts
- src/app/leagues/[id]/page.tsx
- src/app/api/leagues/route.ts
- src/components/copy-button.tsx
- src/app/layout.tsx (Dev Mode banner)
```

This prevents:

* Context loss across chats
* Incorrect architectural assumptions
* Re-solving already-fixed issues

---

## 🧪 Mid-Day / Before Big Changes Checklist

Before starting a new feature or refactor:

* [ ] Dev server started with TLS disabled
* [ ] Prisma client generated
* [ ] Auth bypass ON or OFF intentionally
* [ ] Server vs Client component responsibility is clear
* [ ] No event handlers in Server Components

---

## 🌙 End of Development Day (MANDATORY)

Before stopping for the day, **paste this into ChatGPT**:

```
End of Day Recap:
- What we fixed:
- What works now:
- What is intentionally bypassed:
- What errors still exist:
- Last files touched:
- Next thing to do tomorrow:
```

### Example

```
End of Day Recap:
- Added dev auth bypass
- Fixed Prisma TLS issue via NODE_TLS_REJECT_UNAUTHORIZED
- Invite links copy correctly
- League page uses getCurrentUser()
- CopyButton is client component
- Next step: implement /join/[token] flow
```

This ensures:

* Fast pickup tomorrow
* No repeated debugging
* Accurate continuation of work

---

## ❌ Things NOT to Do

* ❌ Do not set `NODE_ENV` manually
* ❌ Do not add event handlers to Server Components
* ❌ Do not assume ChatGPT remembers previous chats
* ❌ Do not debug Prisma before checking TLS env
* ❌ Do not bypass auth unintentionally

---

## ✅ Golden Rules

* Server Components → data + layout
* Client Components → interactivity
* One auth source of truth: `getCurrentUser()`
* Auth bypass is **dev-only**
* Every new chat starts with a snapshot
* Every day ends with a recap

---

## 🧭 Debug Order When Something Breaks

Ask these **in order**:

1. Is TLS disabled for this terminal session?
2. Did Prisma client regenerate?
3. Is auth bypass ON or OFF intentionally?
4. Is this a server/client boundary issue?
5. Did I provide ChatGPT a context snapshot?

---

## 🧩 Optional Improvements (Future)

* `scripts/dev.ps1` to automate TLS + dev startup
* `/docs/dev.md` expanded onboarding guide
* Startup warnings if TLS is not disabled
* Feature-flag banners for other dev-only behavior

---

**This file exists to protect future-you. Use it.**

---

If you want next, I can:

* Generate the `dev.ps1` script
* Add a startup check that logs warnings if TLS isn’t set
* Move on to the `/join/[token]` flow

This is a *very* strong workflow foundation.
