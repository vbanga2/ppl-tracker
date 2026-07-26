# PPL Tracker — Claude Code Guide

## Project overview
A mobile-first PWA for logging Push/Pull/Legs workouts, body weight, and nutrition. Deployed to GitHub Pages at `https://vbanga2.github.io/ppl-tracker/`.

## Stack
- React 19 + TypeScript 6, Vite 8, Tailwind CSS 4
- Dexie (IndexedDB) for all local persistence
- Recharts for progress charts
- `vite-plugin-pwa` with Workbox for offline support
- Vitest + Testing Library for unit tests
- oxlint for linting

## Commands
```
npm run dev        # dev server (localhost:5173)
npm run build      # tsc + vite build → dist/
npm run test       # vitest run (single pass)
npm run test:watch # vitest watch
npm run lint       # oxlint
npm run preview    # preview prod build
```

## Source layout
```
src/
  data/       db.ts (Dexie schema), repo.ts (CRUD), backup.ts (export/import)
  domain/     plan.ts, progression.ts, metrics.ts, units.ts — pure business logic
  features/   body/, nutrition/, progress/, settings/, workout/ — page components
  ui/         shared components (Nav, Stepper, InstallGate, StorageBanner)
  App.tsx     routing and top-level layout
  main.tsx    React entry point
```

## Critical config
- `vite.config.ts` must keep `base: '/ppl-tracker/'` — omitting it white-screens the GH Pages deploy.
- PWA manifest `scope` and `start_url` must both be `/ppl-tracker/`.
- `.github/workflows/deploy.yml` requires `id-token: write` for `actions/deploy-pages` to succeed.

## Testing
Run `npm test` before committing. Domain logic (progression, metrics) has unit tests in `src/domain/__tests__/`.
