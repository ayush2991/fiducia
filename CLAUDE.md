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

**Gotcha**: any screen with a top-anchored header (title/eyebrow row, action buttons) needs `useSafeAreaInsets().top` folded into its top padding — a static `paddingTop: 20` overlaps the status bar/dynamic island on notched devices. `tab-bar.tsx` already does this correctly for the bottom inset; mirror that pattern for headers. This bug can hide for a while: a screen that only ever renders centered content (e.g. an empty state with no header) won't show it, and it only becomes visible the moment that screen gains a real top-anchored header — so re-screenshot a screen after adding a header even if the screen "worked" before.

### Driving the iOS Simulator for verification

The project has no `ios/`/`android/` native directories (see below), so verification happens through Expo Go in the Simulator, driven from the CLI/AppleScript rather than Xcode. A few things that cost real time to learn:

- **Check for an already-running Metro/Expo dev server before starting a new one** (`ps aux | grep "expo start"`) — a stale server from an earlier session holds port 8081, and `npx expo start --non-interactive` fails outright instead of prompting for a different port. Reuse the running server (`xcrun simctl openurl booted "exp://<lan-ip>:8081"` reloads the existing app) rather than fighting over the port.
- **`CI=1`/`--non-interactive` puts Metro in a mode with file watching disabled** ("reloads are disabled"). Code changes made while Metro is running in that mode will *not* be picked up by reopening the app — the bundle is stale even though the JS on disk is correct. If you need edit → verify loops, run Metro without `CI=1`.
- **`.env` changes require a full Metro restart**, not just a reload — `EXPO_PUBLIC_*` vars are read and inlined when the dev server starts, not per-bundle.
- **Deep links are far more reliable than tap-simulation for navigating to a specific screen**: `xcrun simctl openurl booted "exp://<lan-ip>:8081/--/<route-path>"` jumps straight to an expo-router route and is the preferred way to screenshot a screen that isn't reachable from the default landing tab, or to sidestep an unreliable tap sequence entirely.
- **`xcrun simctl` has no tap/text-input primitive.** The fallback is AppleScript driving the Simulator window via System Events (`osascript -e 'tell application "System Events" to tell process "Simulator" to click at {x, y}'`, mapping device screenshot pixel coordinates into the Simulator window's point-space frame from `get {position, size} of window 1`). This works reasonably for large targets (tab bar icons) but is unreliable for small targets (~32pt buttons) and **could not reliably focus a `TextInput` at all** in this environment — clicks landed on real nested accessibility elements (confirmed via the deep AX path in the click's output) but never brought up a keyboard, and `keystroke` typed nothing. Treat any flow that requires typing into a field as something to hand off for a human smoke-test rather than something to force through simulated clicks; don't burn a long tool-call chain on coordinate-hunting.
- **There is a persistent, draggable blue gear-icon overlay in the Simulator window** (simulator/OS chrome, not part of the app) that sits in the top-right area and can visually cover app UI in that region — including small custom header buttons — making them look "missing" in a screenshot when they're actually rendering fine underneath. If a top-right element seems to have vanished after a change that shouldn't have removed it, check whether this overlay is sitting on top of it before assuming a real bug (it's draggable — a stray click can move it and reveal what's underneath).

## Automated tests

`jest.config.js` + `tsconfig.jest.json` are already set up (added alongside the watchlist compute layer) — reuse them rather than reinventing test config. Two things about this setup that aren't obvious from `tsconfig.json` alone:

- Expo's base tsconfig sets `"module": "preserve"` / `"moduleResolution": "bundler"`, which `ts-jest` (running under Node/CommonJS) cannot compile against. `tsconfig.jest.json` extends the app's `tsconfig.json` but overrides `module`/`moduleResolution` to `commonjs`/`node` and adds Jest's ambient types — `jest.config.js` points `ts-jest`'s `transform` at it.
- The app-wide `tsconfig.json` excludes `**/*.test.ts` so that `npx tsc --noEmit` (which intentionally has no Jest types, since app code should never reference `describe`/`it`/`expect`) doesn't fail on test files. `ts-jest` type-checks test files separately via `tsconfig.jest.json`, so this exclusion doesn't weaken test coverage.
- `jest.config.js` has a `moduleNameMapper` for the `@/*` path alias — Jest doesn't read `tsconfig.json`'s `paths` automatically, so this needs to stay in sync if the alias ever changes.

## Native projects

There are no checked-in `ios/`/`android/` native directories — this is a managed Expo workflow (`.gitignore` explicitly excludes `/ios` and `/android`). Don't hand-edit native project files; use `app.json` (Expo config) and Expo config plugins instead. If bare native code becomes necessary, it would require `expo prebuild`.
