This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

```
reality-tv-fantasy
├─ components.json
├─ eslint.config.mjs
├─ next.config.ts
├─ package-lock.json
├─ package.json
├─ postcss.config.mjs
├─ prisma
│  ├─ migrations
│  │  ├─ 20251224015205_init
│  │  │  └─ migration.sql
│  │  ├─ 20251224043513_leagues
│  │  │  └─ migration.sql
│  │  ├─ 20251225043639_drag_race_entries
│  │  │  └─ migration.sql
│  │  ├─ 20251226002555_episodes_and_scoring
│  │  │  └─ migration.sql
│  │  ├─ 20251229030059_add_display_name
│  │  │  └─ migration.sql
│  │  ├─ 20251229044111_finale_lipsync_wins
│  │  │  └─ migration.sql
│  │  └─ migration_lock.toml
│  └─ schema.prisma
├─ prisma.config.ts
├─ public
│  ├─ file.svg
│  ├─ globe.svg
│  ├─ next.svg
│  ├─ vercel.svg
│  └─ window.svg
├─ README.md
├─ README_DEV.md
├─ src
│  ├─ app
│  │  ├─ (app)
│  │  │  ├─ account
│  │  │  │  ├─ actions.tsx
│  │  │  │  └─ page.tsx
│  │  │  ├─ dashboard
│  │  │  │  ├─ page.tsx
│  │  │  │  └─ sign-out-button.tsx
│  │  │  ├─ layout.tsx
│  │  │  └─ leagues
│  │  │     ├─ new
│  │  │     │  ├─ page.tsx
│  │  │     │  └─ ui.tsx
│  │  │     └─ [id]
│  │  │        ├─ leaderboard
│  │  │        │  └─ page.tsx
│  │  │        ├─ page.tsx
│  │  │        ├─ picks
│  │  │        │  ├─ page.tsx
│  │  │        │  └─ picks-client.tsx
│  │  │        └─ weeks
│  │  │           ├─ page.tsx
│  │  │           └─ [week]
│  │  │              └─ page.tsx
│  │  ├─ api
│  │  │  ├─ auth
│  │  │  │  └─ [...nextauth]
│  │  │  │     └─ route.ts
│  │  │  └─ leagues
│  │  │     ├─ route.ts
│  │  │     └─ [id]
│  │  │        ├─ invite
│  │  │        │  └─ route.ts
│  │  │        ├─ picks
│  │  │        │  └─ route.ts
│  │  │        ├─ route.ts
│  │  │        ├─ start
│  │  │        │  └─ route.ts
│  │  │        └─ weeks
│  │  │           └─ [week]
│  │  │              ├─ finale
│  │  │              │  └─ route.ts
│  │  │              └─ route.ts
│  │  ├─ favicon.ico
│  │  ├─ globals.css
│  │  ├─ join
│  │  │  └─ [token]
│  │  │     └─ page.tsx
│  │  ├─ layout.tsx
│  │  ├─ login
│  │  │  ├─ page.tsx
│  │  │  └─ ui.tsx
│  │  ├─ page.tsx
│  │  ├─ providers.tsx
│  │  └─ verify
│  │     └─ page.tsx
│  ├─ components
│  │  ├─ account
│  │  │  └─ display-name-form.tsx
│  │  ├─ app-nav.tsx
│  │  ├─ commissioner
│  │  │  └─ drag-race-week-form.tsx
│  │  ├─ confetti-burst.tsx
│  │  ├─ copy-button.tsx
│  │  ├─ delete-league-button.tsx
│  │  ├─ dev-mode-banner.tsx
│  │  ├─ invite-controls.tsx
│  │  ├─ invite-link.tsx
│  │  ├─ logout-button.tsx
│  │  ├─ start-league-button.tsx
│  │  ├─ theme-provider.tsx
│  │  ├─ theme-toggle.tsx
│  │  └─ ui
│  │     ├─ button.tsx
│  │     ├─ card.tsx
│  │     ├─ input.tsx
│  │     ├─ label.tsx
│  │     └─ select.tsx
│  └─ lib
│     ├─ auth.ts
│     ├─ auth_options.ts
│     ├─ drag-race
│     │  └─ s18.ts
│     ├─ prisma.ts
│     ├─ scoring
│     │  └─ drag-race.ts
│     └─ utils.ts
├─ tailwind.config.ts
└─ tsconfig.json

```