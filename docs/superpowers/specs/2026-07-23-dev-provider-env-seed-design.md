# Dev-only market data provider auto-seed from `.env`

## Problem

The Account tab lets a user pick a BYOK market-data provider (Tiingo or Financial Modeling Prep) and paste in their own free-tier API key, which is validated live and then persisted to `expo-secure-store`. This is the only way to configure a provider today.

For local development in the iOS Simulator, typing into that `TextInput` is unreliable — CLAUDE.md's "Driving the iOS Simulator for verification" section notes that AppleScript-driven taps could not reliably bring up a keyboard or type text at all in this environment. Every fresh simulator install (or cleared secure-store) currently means a slow, unreliable manual flow just to get market data working during dev.

## Goal

Let a developer drop their own personal Tiingo/FMP API keys into the local, gitignored `.env` file, and have the app automatically configure and activate a provider from them on startup in dev builds — without ever touching this behavior in production.

## Design

### `.env`

Add two placeholder lines (left empty; each developer fills in their own key locally):

```
EXPO_PUBLIC_TIINGO_API_KEY=""
EXPO_PUBLIC_FMP_API_KEY=""
```

`.env` is already gitignored, so these never reach version control.

### `seedDevProviderFromEnv()` in `src/lib/api/settings.ts`

A new exported function, placed alongside the existing `saveAndActivateProviderKey`/`getActiveProvider` functions in this module (the module that already owns the `PROVIDERS` registry and all provider-activation logic):

1. Guard: `if (!__DEV__) return;` — never runs in a production build, regardless of whether an `EXPO_PUBLIC_*` var is present.
2. Guard: if `storage.getActiveProviderId()` already returns a provider, return immediately. This never overrides a provider a developer configured by hand through the Account tab — it only fills the gap on a fresh/cleared install.
3. Read `process.env.EXPO_PUBLIC_TIINGO_API_KEY` and `process.env.EXPO_PUBLIC_FMP_API_KEY`.
   - If the Tiingo var is a non-empty string, call `await saveAndActivateProviderKey('tiingo', tiingoKey)`.
   - Else if the FMP var is a non-empty string, call `await saveAndActivateProviderKey('financialModelingPrep', fmpKey)`.
   - Else no-op (neither configured — nothing to seed).
4. Wrap the `saveAndActivateProviderKey` call in try/catch, logging (`console.warn`) and swallowing any failure (invalid key, offline, vendor API error). This matches the app's existing swallow-all-errors-and-fall-back-to-cache pattern used elsewhere for market data (see `ensureFreshHistory`) — a bad or stale dev key must never crash app startup.

Tiingo takes priority if both vars are set, since it's simpler to reason about a fixed priority than to treat "both set" as an error case for a dev-only convenience path.

### Wiring

`src/app/_layout.tsx` already sets up the app-wide `QueryClient` on mount. Add a fire-and-forget call there:

```ts
useEffect(() => {
  seedDevProviderFromEnv();
}, []);
```

No loading state, no blocking of first render — this is a best-effort background convenience, not a required startup step.

## Out of scope

- Re-checking env vars on every launch to pick up a rotated key once a provider is already active (not needed for dev convenience; a developer can clear secure-store or use the Account tab to switch keys).
- Any production/staging equivalent — this is dev-only by design (`__DEV__` guard).
- Validating `.env` file structure or presence — if the file or vars are missing, the seed function simply no-ops.
