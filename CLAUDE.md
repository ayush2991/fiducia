# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Fiducia is a React Native app (Expo, TypeScript) for comparing investment portfolios, targeting both iOS and Android. The codebase is currently a fresh Expo scaffold — `App.tsx` is the sole entry point rendered via `index.ts` (`registerRootComponent`). No navigation, state management, or data layer has been added yet.

## Planned architecture

`docs/superpowers/specs/2026-07-16-portfolio-comparison-design.md` is the approved design spec for the first real feature (portfolio comparison + charting) and is the source of truth for architecture decisions once implementation starts. Read it before scaffolding `src/`. Key decisions from that spec, useful context even before code exists:

- **Local-only v1**: expo-sqlite for storage (portfolios, holdings, cached daily prices, watchlist) — no backend/auth yet. A v2 Supabase migration is anticipated, so all data access must go through `src/lib/api/*`; UI code and screens never touch SQLite or the market-data API directly.
- **Market data**: Alpha Vantage `TIME_SERIES_DAILY`, delta-fetched (only the missing tail per ticker) to stay under free-tier quota, with cached data served on fetch failure/offline.
- **Computation is in-memory, on demand** from the raw price cache (no precomputed stats cache) — return, volatility, max drawdown, alpha/beta/correlation, Sharpe.
- **State management**: TanStack Query for async data through `src/lib/api/*`; plain React state for local UI state (active tab/portfolio/period). No Zustand/Redux.
- **Screens**: 4-tab shell (Overview/Compare/Watchlist/Account) plus an Add Portfolio flow, per the "Nocturne" dark-theme mockups. `Portfolio Tracker.html` at the repo root is a bundled export of that mockup set — a visual reference, not app code.
- `docs/plans/backend-foundation.md` (an earlier, superseded plan) is referenced by the spec but does not currently exist in this repo — treat the spec above as authoritative.

## Commands

- `npm start` — start the Expo dev server (Metro); scan the QR code with Expo Go or press `i`/`a` in the terminal.
- `npm run ios` — start the dev server and launch the iOS simulator.
- `npm run android` — start the dev server and launch the Android emulator.
- `npm run web` — start the dev server for web.
- `npx tsc --noEmit` — type-check the project (there is no separate `lint`/`test`/`build` script defined yet).

## Important: Expo SDK version

This project is on **Expo SDK 57**, which is a recent major version with breaking changes from prior SDKs. Before writing Expo-related code (config, APIs, plugins), consult the versioned docs at https://docs.expo.dev/versions/v57.0.0/ rather than relying on general Expo knowledge, since APIs and conventions may have changed.

## Matching the mock exactly

`Portfolio Tracker.html` at the repo root is the source of truth for visual design (colors, type scale, spacing, component styles, icons) — not the prose in the design spec doc, which doesn't carry exact hex codes or pixel values. Its real markup is a JSON-escaped JS string wrapped in bundler boilerplate; skimming the outer wrapper is not enough to find the actual mock content. Decode it first (e.g. `python3 -c "import json,re,pathlib; ..."` to pull out the escaped HTML) and extract concrete tokens (hex colors, font sizes/weights, border/radius values, exact icon SVG paths) from the decoded markup before writing any styling code. Do not build UI from memory of "how this kind of app usually looks."

## Verifying UI changes

`npx tsc --noEmit` and a successful Metro bundle only prove the code compiles — they do not prove it renders correctly. Do not report a UI task as done without actually looking at it running in the simulator (screenshot via `xcrun simctl io booted screenshot`), and check *every* screen/state touched by the change, not just the first one — a passing type-check previously shipped a broken bottom tab bar (see gotcha below) that went unnoticed because only one screen was screenshotted.

**Gotcha**: `expo-router/ui`'s `<TabTrigger asChild>` injects a default Radix Slot style (`flexDirection: 'row', justifyContent: 'space-between'`) onto whatever child it wraps. If a custom tab-bar-button component spreads that incoming `style` prop after its own styles (directly, or via `{...props}` where `style` wasn't destructured out first), it silently overrides intended layout (e.g. turns a centered icon-over-label column into a squashed, misaligned row) with no type error and no crash — only visible by looking at the rendered screen. When wrapping `asChild` children from `expo-router/ui`, either don't forward the injected `style` at all, or merge it with your own styles *first* in the array so your styles win on conflicting keys.

## Native projects

There are no checked-in `ios/`/`android/` native directories — this is a managed Expo workflow (`.gitignore` explicitly excludes `/ios` and `/android`). Don't hand-edit native project files; use `app.json` (Expo config) and Expo config plugins instead. If bare native code becomes necessary, it would require `expo prebuild`.
