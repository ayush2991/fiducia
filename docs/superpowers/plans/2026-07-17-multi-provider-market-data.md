# Multi-Provider Market Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user pick their market data provider (Alpha Vantage, Tiingo, or Financial Modeling Prep) from a Settings screen, enter their own API key for it, and have the whole app fetch prices/company names through that provider — no fundamentals, no multi-provider fan-out, exactly one active provider at a time. Switching providers must not require touching any code outside `src/lib/api/providers/` and the new settings module.

**Architecture:** `src/lib/api/marketData.ts` already sits as the sole boundary between the app and a market-data vendor — no screen or other `src/lib/api/*` module talks to a vendor directly, and every caller already consumes the vendor-neutral `PricePoint = { date, close }` shape. This plan generalizes that single hardcoded Alpha Vantage implementation into a small provider registry: each vendor gets an adapter module implementing a shared `MarketDataProvider` interface (`fetchDailySeries`, `lookupCompanyName`, `validateApiKey`), and `marketData.ts` becomes a thin dispatcher that resolves "which provider is active, with which key" (via a new `src/lib/api/settings.ts` / `src/lib/storage/settings.ts` pair) and delegates. The active-provider selection and per-provider keys are user secrets, so they live in `expo-secure-store`, not SQLite — a new storage module alongside (not inside) `src/lib/storage/db.ts`. No changes are needed to `portfolios.ts`, `watchlist.ts`, `compare.ts`, or any `src/lib/compute/*` function — they only ever consumed the vendor-neutral interface. `src/screens/account/index.tsx` is currently a two-line stub, so the Settings UI is new screen work, not a refactor.

**Tech Stack:** Expo SDK 57, `expo-secure-store` (new dependency), existing `src/lib/api`/`src/lib/storage` layering, Jest for the new pure-parsing logic in each adapter.

## Global Constraints

- UI code never touches `expo-secure-store` or any vendor HTTP endpoint directly — only `src/lib/api/settings.ts` and `src/lib/api/marketData.ts` (same layering rule as the rest of the app, per `CLAUDE.md`).
- Exactly one provider is active at a time. Selecting a new active provider does not delete a previously-entered key for another provider — a user can save keys for more than one vendor and flip the active selection without re-entering a key, but the app only ever calls the currently-active one.
- Fundamentals (P/E, EPS, etc.) are explicitly out of scope — every adapter implements price + name lookup only.
- `PeriodKey` stays capped at `1D`/`7D`/`30D`/`3M` (per `CLAUDE.md`) regardless of provider — this plan does not change chart period range, even though Tiingo/FMP can technically back longer history. That's a separate decision for later.
- On fetch failure (including "no key configured yet"), existing cached-data fallback behavior in `portfolios.ts`/`watchlist.ts` must keep working — a missing/invalid key should degrade the same way a rate-limit or offline failure does today (serve stale cache if any exists; surface a real error only when there's nothing cached).
- Before implementing each adapter's error handling, confirm the current error-response shape against that vendor's live docs (Alpha Vantage's `Note`/`Information`/`Error Message` fields are already confirmed in the existing code; Tiingo's and FMP's exact error JSON should be checked against their docs/a real failing request at implementation time rather than assumed from memory).
- Expo SDK 57 — consult https://docs.expo.dev/versions/v57.0.0/ before assuming `expo-secure-store` API shape.
- After any UI-affecting task, verify by running the app in the simulator and taking a screenshot (`xcrun simctl io booted screenshot`) — per `CLAUDE.md` "Verifying UI changes."

---

## Task 1: Install `expo-secure-store`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install**

Run:
```bash
npx expo install expo-secure-store
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add expo-secure-store for per-user market data API keys"
```

---

## Task 2: Provider types and registry metadata

**Files:**
- Create: `src/lib/api/providers/types.ts`

**Interfaces:**
- Produces: `ProviderId`, `MarketDataProvider`, `PROVIDER_METADATA` — consumed by every later task.

- [ ] **Step 1: Write the shared provider contract**

```typescript
import type { PricePoint } from '@/lib/compute/returns';

export type ProviderId = 'alphaVantage' | 'tiingo' | 'financialModelingPrep';

export interface MarketDataProvider {
  fetchDailySeries(ticker: string, apiKey: string): Promise<PricePoint[]>;
  lookupCompanyName(ticker: string, apiKey: string): Promise<string>;
  // Cheap call used by the Settings screen to confirm a pasted key actually
  // works before saving it — must not throw on a valid key, must throw a
  // human-readable message on an invalid one.
  validateApiKey(apiKey: string): Promise<void>;
}

export interface ProviderMetadata {
  id: ProviderId;
  label: string;
  signupUrl: string;
}

export const PROVIDER_METADATA: ProviderMetadata[] = [
  { id: 'alphaVantage', label: 'Alpha Vantage', signupUrl: 'https://www.alphavantage.co/support/#api-key' },
  { id: 'tiingo', label: 'Tiingo', signupUrl: 'https://api.tiingo.com' },
  { id: 'financialModelingPrep', label: 'Financial Modeling Prep', signupUrl: 'https://site.financialmodelingprep.com' },
];
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no errors (PricePoint import will resolve once Task 3 confirms its actual export location — check whether `PricePoint` should be re-exported from `src/lib/api/types.ts` instead, to avoid `api/` depending on `compute/`'s local type re-declaration; align with whichever module already exports it today).

- [ ] **Step 3: Commit**

```bash
git add src/lib/api/providers/types.ts
git commit -m "feat: add MarketDataProvider interface and provider registry metadata"
```

---

## Task 3: Alpha Vantage adapter (migrate existing logic)

**Files:**
- Create: `src/lib/api/providers/alphaVantage.ts`
- Delete (logic moves out, dispatcher replaces it): content of current `src/lib/api/marketData.ts` (file itself is rewritten in Task 6, not deleted)

**Interfaces:**
- Produces: `alphaVantageProvider: MarketDataProvider`

- [ ] **Step 1: Move the existing Alpha Vantage implementation verbatim into the adapter shape**

Port the current body of `src/lib/api/marketData.ts` (the `DailySeriesResponse`/`SymbolSearchResponse` types, `fetchDailySeries`, `lookupCompanyName`, and the `Note`/`Information`/`Error Message` handling) into `alphaVantage.ts`, adapted to take `apiKey` as a parameter instead of reading `process.env.EXPO_PUBLIC_ALPHA_VANTAGE_API_KEY` at module scope, and export it as an object implementing `MarketDataProvider`:

```typescript
import type { MarketDataProvider } from './types';
import type { PricePoint } from '@/lib/compute/returns'; // or wherever Task 2 settled

const BASE_URL = 'https://www.alphavantage.co/query';

// ... DailySeriesResponse / SymbolSearchResponse types unchanged from current marketData.ts ...

async function fetchDailySeries(ticker: string, apiKey: string): Promise<PricePoint[]> {
  const url = `${BASE_URL}?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(ticker)}&outputsize=compact&apikey=${apiKey}`;
  // ... identical body to current fetchDailySeries, using apiKey param instead of requireApiKey() ...
}

async function lookupCompanyName(ticker: string, apiKey: string): Promise<string> {
  // ... identical body to current lookupCompanyName ...
}

async function validateApiKey(apiKey: string): Promise<void> {
  // Cheapest real call that proves the key works: a SYMBOL_SEARCH for a
  // known-good ticker. Throw with a readable message on Note/Information/
  // Error Message, exactly like fetchDailySeries does.
  await fetchDailySeries('SPY', apiKey);
}

export const alphaVantageProvider: MarketDataProvider = { fetchDailySeries, lookupCompanyName, validateApiKey };
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no errors. (`marketData.ts` still exists with its old content for now — it gets rewritten in Task 6 once all three adapters exist, so the app still builds mid-plan.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/api/providers/alphaVantage.ts
git commit -m "refactor: extract Alpha Vantage client into a MarketDataProvider adapter"
```

---

## Task 4: Tiingo adapter

**Files:**
- Create: `src/lib/api/providers/tiingo.ts`
- Create: `src/lib/api/providers/tiingo.test.ts`

**Interfaces:**
- Produces: `tiingoProvider: MarketDataProvider`

- [ ] **Step 1: Confirm the current Tiingo REST shape**

Before writing the parser, check `https://www.tiingo.com/documentation/end-of-day` and `https://www.tiingo.com/documentation/general/overview` for: the exact EOD-prices endpoint path and query params (token is passed as `?token=`, confirmed earlier — but confirm date-range params and default response ordering), the ticker-metadata/search endpoint used for company name lookup, and the current error-response shape for an invalid token / unknown ticker (do not assume it mirrors Alpha Vantage's `Note`/`Error Message` fields — Tiingo uses HTTP status codes with a JSON `detail` field per typical usage, but confirm against live docs).

- [ ] **Step 2: Implement the adapter**

```typescript
import type { MarketDataProvider } from './types';
import type { PricePoint } from '@/lib/compute/returns';

const BASE_URL = 'https://api.tiingo.com';

async function fetchDailySeries(ticker: string, apiKey: string): Promise<PricePoint[]> {
  const url = `${BASE_URL}/tiingo/daily/${encodeURIComponent(ticker)}/prices?token=${apiKey}`;
  const res = await fetch(url);
  if (res.status === 404) throw new Error(`Unknown ticker: ${ticker}`);
  if (!res.ok) throw new Error(`Tiingo request failed with status ${res.status}`);
  const data = (await res.json()) as { date: string; close: number }[];
  return data
    .map((p) => ({ date: p.date.slice(0, 10), close: p.close }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function lookupCompanyName(ticker: string, apiKey: string): Promise<string> {
  const url = `${BASE_URL}/tiingo/daily/${encodeURIComponent(ticker)}?token=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return ticker;
  const data = (await res.json()) as { name?: string };
  return data.name ?? ticker;
}

async function validateApiKey(apiKey: string): Promise<void> {
  await fetchDailySeries('SPY', apiKey);
}

export const tiingoProvider: MarketDataProvider = { fetchDailySeries, lookupCompanyName, validateApiKey };
```

Adjust endpoint paths/response fields to match what Step 1's doc check actually found — the above is a starting sketch, not confirmed final shape.

- [ ] **Step 3: Unit test the response parsing**

Mock `fetch` and assert: a normal price array maps to sorted `PricePoint[]`, a 404 throws "Unknown ticker", a non-OK non-404 status throws with the status code in the message.

- [ ] **Step 4: Verify**

Run: `npm test -- src/lib/api/providers/tiingo.test.ts` and `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/providers/tiingo.ts src/lib/api/providers/tiingo.test.ts
git commit -m "feat: add Tiingo MarketDataProvider adapter"
```

---

## Task 5: Financial Modeling Prep adapter

**Files:**
- Create: `src/lib/api/providers/financialModelingPrep.ts`
- Create: `src/lib/api/providers/financialModelingPrep.test.ts`

**Interfaces:**
- Produces: `financialModelingPrepProvider: MarketDataProvider`

- [ ] **Step 1: Confirm the current FMP REST shape**

Check `https://site.financialmodelingprep.com/developer/docs` for the current historical-EOD-price endpoint (has changed shape across FMP API versions — confirm v3 vs. stable/v4 path), the `apikey` query param name, the company-profile/search endpoint for name lookup, and the current error-response shape (historically an `Error Message` string field similar to Alpha Vantage, but confirm — don't assume).

- [ ] **Step 2: Implement the adapter**

Same shape as Task 4's adapter — `fetchDailySeries`/`lookupCompanyName`/`validateApiKey` against whatever Step 1 confirms, normalizing to `PricePoint[]` sorted ascending by date, throwing a readable `Error` on a bad key or unknown ticker.

- [ ] **Step 3: Unit test the response parsing** (same pattern as Task 4 Step 3).

- [ ] **Step 4: Verify**

Run: `npm test -- src/lib/api/providers/financialModelingPrep.test.ts` and `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/providers/financialModelingPrep.ts src/lib/api/providers/financialModelingPrep.test.ts
git commit -m "feat: add Financial Modeling Prep MarketDataProvider adapter"
```

---

## Task 6: Settings storage (secure-store)

**Files:**
- Create: `src/lib/storage/settings.ts`

**Interfaces:**
- Produces: `getActiveProviderId`, `setActiveProviderId`, `getStoredApiKey(providerId)`, `setStoredApiKey(providerId, key)`, `clearStoredApiKey(providerId)`

- [ ] **Step 1: Write the secure-store wrapper**

```typescript
import * as SecureStore from 'expo-secure-store';
import type { ProviderId } from '@/lib/api/providers/types';

const ACTIVE_PROVIDER_KEY = 'fiducia.activeProvider';
const apiKeyStorageKey = (providerId: ProviderId) => `fiducia.apiKey.${providerId}`;

export async function getActiveProviderId(): Promise<ProviderId | null> {
  return (await SecureStore.getItemAsync(ACTIVE_PROVIDER_KEY)) as ProviderId | null;
}

export async function setActiveProviderId(providerId: ProviderId): Promise<void> {
  await SecureStore.setItemAsync(ACTIVE_PROVIDER_KEY, providerId);
}

export async function getStoredApiKey(providerId: ProviderId): Promise<string | null> {
  return SecureStore.getItemAsync(apiKeyStorageKey(providerId));
}

export async function setStoredApiKey(providerId: ProviderId, key: string): Promise<void> {
  await SecureStore.setItemAsync(apiKeyStorageKey(providerId), key);
}

export async function clearStoredApiKey(providerId: ProviderId): Promise<void> {
  await SecureStore.deleteItemAsync(apiKeyStorageKey(providerId));
}
```

Confirm `expo-secure-store`'s exact async API (`getItemAsync`/`setItemAsync`/`deleteItemAsync`) against the SDK 57 docs before finalizing — the shape above is standard across recent SDKs but verify rather than assume.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/storage/settings.ts
git commit -m "feat: add secure-store-backed settings storage for provider selection and API keys"
```

---

## Task 7: Settings API layer

**Files:**
- Create: `src/lib/api/settings.ts`

**Interfaces:**
- Produces: `listProviders()`, `getActiveProvider()`, `saveProviderApiKey(providerId, key)` (validates then stores), `activateProvider(providerId)`, `getActiveProviderKey()` — consumed by Task 8 (Settings screen) and Task 9 (dispatcher).

- [ ] **Step 1: Write the API layer**

```typescript
import * as storage from '@/lib/storage/settings';
import { PROVIDER_METADATA, type ProviderId } from './providers/types';
import { alphaVantageProvider } from './providers/alphaVantage';
import { tiingoProvider } from './providers/tiingo';
import { financialModelingPrepProvider } from './providers/financialModelingPrep';

const PROVIDERS = {
  alphaVantage: alphaVantageProvider,
  tiingo: tiingoProvider,
  financialModelingPrep: financialModelingPrepProvider,
};

export function listProviders() {
  return PROVIDER_METADATA;
}

export async function getActiveProvider(): Promise<ProviderId | null> {
  return storage.getActiveProviderId();
}

export async function hasStoredKey(providerId: ProviderId): Promise<boolean> {
  return (await storage.getStoredApiKey(providerId)) !== null;
}

// Validates the key against the live provider before persisting it or
// activating it — a bad key should never silently become "active".
export async function saveAndActivateProviderKey(providerId: ProviderId, key: string): Promise<void> {
  await PROVIDERS[providerId].validateApiKey(key); // throws with a readable message on failure
  await storage.setStoredApiKey(providerId, key);
  await storage.setActiveProviderId(providerId);
}

export async function clearProviderKey(providerId: ProviderId): Promise<void> {
  await storage.clearStoredApiKey(providerId);
  const active = await storage.getActiveProviderId();
  if (active === providerId) {
    // No provider is left active; marketData.ts must treat this as "not configured".
    await SecureStore_deleteActiveMarker(); // placeholder — implement as storage.clearActiveProviderId(), add to Task 6
  }
}

export async function getActiveProviderAndKey(): Promise<{ providerId: ProviderId; apiKey: string } | null> {
  const providerId = await storage.getActiveProviderId();
  if (!providerId) return null;
  const apiKey = await storage.getStoredApiKey(providerId);
  if (!apiKey) return null;
  return { providerId, apiKey };
}
```

Note the `clearProviderKey` sketch above references a `clearActiveProviderId` helper not yet defined in Task 6 — add it there (`SecureStore.deleteItemAsync(ACTIVE_PROVIDER_KEY)`) when implementing this task, and drop the placeholder call.

- [ ] **Step 2: Export the provider-facing fetch functions this module now owns**

Also add here (or keep in `marketData.ts`, see Task 9 — pick one; recommend keeping the fetch entry points in `marketData.ts` since that's what every existing caller already imports, and have `settings.ts` own only provider/key management, not the fetch functions).

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/api/settings.ts src/lib/storage/settings.ts
git commit -m "feat: add settings API layer for provider selection and key validation"
```

---

## Task 8: Rewrite `marketData.ts` as a dispatcher

**Files:**
- Modify: `src/lib/api/marketData.ts`

**Interfaces:**
- Preserves the existing signatures every caller already uses: `fetchDailySeries(ticker): Promise<PricePoint[]>`, `lookupCompanyName(ticker): Promise<string>` — zero changes needed in `portfolios.ts`, `watchlist.ts`, `compare.ts`.
- Adds: a distinguishable error (e.g. `NoProviderConfiguredError`) thrown when no active provider/key exists, for Task 10's empty-state handling.

- [ ] **Step 1: Replace the file body**

```typescript
import { getActiveProviderAndKey } from './settings';
import { alphaVantageProvider } from './providers/alphaVantage';
import { tiingoProvider } from './providers/tiingo';
import { financialModelingPrepProvider } from './providers/financialModelingPrep';
import type { ProviderId } from './providers/types';
import type { PricePoint } from '@/lib/compute/returns';

export class NoProviderConfiguredError extends Error {
  constructor() {
    super('No market data provider configured. Add an API key in Settings.');
    this.name = 'NoProviderConfiguredError';
  }
}

const PROVIDERS = {
  alphaVantage: alphaVantageProvider,
  tiingo: tiingoProvider,
  financialModelingPrep: financialModelingPrepProvider,
};

async function resolveActive(): Promise<{ providerId: ProviderId; apiKey: string }> {
  const active = await getActiveProviderAndKey();
  if (!active) throw new NoProviderConfiguredError();
  return active;
}

export async function fetchDailySeries(ticker: string): Promise<PricePoint[]> {
  const { providerId, apiKey } = await resolveActive();
  return PROVIDERS[providerId].fetchDailySeries(ticker, apiKey);
}

export async function lookupCompanyName(ticker: string): Promise<string> {
  const { providerId, apiKey } = await resolveActive();
  return PROVIDERS[providerId].lookupCompanyName(ticker, apiKey);
}
```

This deliberately duplicates the small `PROVIDERS` map from `settings.ts` rather than importing it, to avoid a circular import (`settings.ts` → adapters, `marketData.ts` → adapters + `settings.ts`'s `getActiveProviderAndKey`). If this feels redundant once both files exist, consider moving the `PROVIDERS` map into `providers/types.ts` or a new `providers/registry.ts` as the single source, imported by both — decide at implementation time based on what actually compiles cleanly.

- [ ] **Step 2: Delete the now-unused `EXPO_PUBLIC_ALPHA_VANTAGE_API_KEY` env var references**

Remove `requireApiKey()` and the module-level `API_KEY`/`process.env` read — this file no longer reads any env var. Update `.env.example` to remove the Alpha Vantage line (or leave it as an optional dev convenience — decide based on whether you want a fallback dev key; recommend removing it, since the whole point is per-user runtime keys now).

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`. Expected: `portfolios.ts`, `watchlist.ts`, `compare.ts` compile unchanged (they only import `fetchDailySeries`/`lookupCompanyName`, whose signatures didn't change).

- [ ] **Step 4: Commit**

```bash
git add src/lib/api/marketData.ts .env.example
git commit -m "refactor: turn marketData.ts into a provider dispatcher, remove build-time API key"
```

---

## Task 9: Handle "no provider configured" as a real UI state

**Files:**
- Modify: `src/screens/overview/index.tsx`, `src/screens/compare/index.tsx`, `src/screens/watchlist/index.tsx` (exact files depend on where each screen currently surfaces fetch errors — check each screen's existing error/empty-state handling before editing)

**Interfaces:**
- Consumes: `NoProviderConfiguredError` from `marketData.ts` (via whatever `src/lib/api/*` call surfaces it up).

- [ ] **Step 1: Audit current error handling on each screen**

Find how each screen currently reacts to a thrown error from `getLatestPrice`/watchlist performance calls (React Query `error` state, presumably). Confirm whether there's already a generic error UI or nothing at all.

- [ ] **Step 2: Add a specific empty-state for `NoProviderConfiguredError`**

Reuse the existing `EmptyState` component (`src/components/empty-state`) with copy like "Add a market data provider in Settings to see prices" and a way to navigate to the Account tab (`router.push` to the account route, or `TabTrigger` if within the tab shell).

- [ ] **Step 3: Verify in simulator**

Run the app with no key configured (fresh SecureStore, i.e. fresh simulator install) and screenshot Overview, Compare, and Watchlist to confirm each shows the new empty-state rather than a crash or a raw error string.

- [ ] **Step 4: Commit**

```bash
git add src/screens/overview/index.tsx src/screens/compare/index.tsx src/screens/watchlist/index.tsx
git commit -m "feat: show a Settings-directing empty state when no market data provider is configured"
```

---

## Task 10: Settings screen UI

**Files:**
- Modify: `src/screens/account/index.tsx`
- Create: `src/screens/account/styles.ts` (if the pattern in other screens splits styles out — check an existing screen like `src/screens/watchlist/index.tsx` for the convention before deciding file layout)

**Interfaces:**
- Consumes: `listProviders`, `getActiveProvider`, `hasStoredKey`, `saveAndActivateProviderKey`, `clearProviderKey` from `src/lib/api/settings.ts`.

- [ ] **Step 1: Design the row layout against the mock's existing Account visual language**

`docs/mock-reference.html` (`"Nocturne Tab Shell"` block, `isAccount` section, lines ~397-419) defines the Account screen's existing visual pattern even though it has no "data provider" row today: 56px avatar circle, "Preferences" section header (11px, `letter-spacing:.06em`, uppercase, `#75798c`), and rows shaped `28px icon chip (7px radius, #232532 bg) + 13.5px label (#e9e9ed) + chevron`. Since there's no mock markup for a provider picker specifically, build new rows following that same visual pattern rather than inventing a different style — reuse the row shape shown at mock lines 408-416 for each provider, and add a per-provider expandable state (tap row → reveal a `TextInput` for the key + a "Save & Activate" button + an inline validation error) rather than a full separate screen, unless a separate screen reads better once built.

- [ ] **Step 2: Build the component**

Per-provider row shows: name, a filled/empty radio-style indicator for "is this the active provider" (reuse the dot pattern from the portfolio switcher sheet at mock lines 429-433), and a chevron. Tapping expands a key-entry field (reuse `TextInput` styling from `src/screens/add-portfolio/index.tsx`) with a "Save & Activate" button that calls `saveAndActivateProviderKey`, shows a loading state during the live `validateApiKey` call, and surfaces the thrown error message inline on failure. Follow the theme rules in `CLAUDE.md` (`useTheme()` + `createStyles(colors)` memoized with `useMemo`, no module-level `StyleSheet.create` referencing colors).

- [ ] **Step 3: Wire to TanStack Query**

Use `useQuery` for `listProviders`/`getActiveProvider`/`hasStoredKey` (per provider) and `useMutation` for `saveAndActivateProviderKey`/`clearProviderKey`, invalidating the relevant queries on success — same pattern as `add-portfolio`'s mutation usage.

- [ ] **Step 4: Handle safe-area top inset**

Per `CLAUDE.md`'s header gotcha — this screen previously had no top-anchored header (just a centered `EmptyState`), so it's exactly the case flagged as "won't show the bug until a real header is added." Fold `useSafeAreaInsets().top` into the new header's top padding.

- [ ] **Step 5: Verify in simulator**

Screenshot the Account tab with: no keys saved (initial state), one provider's key saved and active, and mid-entry with an invalid key (confirm the inline error renders and nothing gets persisted/activated).

- [ ] **Step 6: Commit**

```bash
git add src/screens/account/
git commit -m "feat: build Settings screen for choosing a market data provider and entering its API key"
```

---

## Task 11: Update project docs

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Replace the Alpha-Vantage-specific "Market data" bullet**

Update the "Market data" bullet under "Key behavioral decisions" to describe the provider-agnostic architecture: `src/lib/api/marketData.ts` dispatches to the active provider (chosen and keyed per-user in Settings, stored in `expo-secure-store`), adapters live in `src/lib/api/providers/`, fundamentals remain out of scope, and the once-a-day refresh cap in `portfolios.ts`/`watchlist.ts` is unchanged and provider-agnostic.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: describe the multi-provider market data architecture"
```

---

## Task 12: End-to-end manual verification

- [ ] Fresh simulator install (or cleared SecureStore): confirm Overview/Compare/Watchlist show the "no provider configured" empty state, not a crash.
- [ ] Enter a real Alpha Vantage key in Settings, confirm it activates and prices load on Overview.
- [ ] Enter a real Tiingo key, switch active provider to Tiingo, confirm prices still load (same tickers, different vendor) without touching any other screen's code path.
- [ ] Enter an intentionally invalid key for any provider, confirm the Settings screen shows an inline error and does **not** activate that provider or overwrite the previously-active one.
- [ ] Kill and relaunch the app; confirm the previously-active provider and its key persist (SecureStore survives app restart) without re-entering anything.
