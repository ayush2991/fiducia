import { EmptyState } from '@/components/empty-state';

// The mock's Watchlist tab always shows populated demo rows; this reuses
// the empty-state pattern for the zero-tickers case, which the mock doesn't cover.
export function Watchlist() {
  return (
    <EmptyState
      title="Your watchlist is empty"
      message="Track tickers here without adding them to a portfolio."
    />
  );
}
