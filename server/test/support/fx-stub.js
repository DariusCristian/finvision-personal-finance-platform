// Deterministic Frankfurter responses for tests: no test may call the real FX provider.
// Rates are defined as EUR per unit, so every pair is consistent: 1 RON = 0.2 EUR, 1 USD = 0.9 EUR.
export const EUR_PER_UNIT = { EUR: 1, RON: 0.2, USD: 0.9 };

export const testRate = (from, to) => EUR_PER_UNIT[from] / EUR_PER_UNIT[to];

// Returns a Response for Frankfurter URLs (latest or a dated path), or null for any other URL.
export const frankfurterStubResponse = (input) => {
  const url = new URL(String(input));

  if (url.hostname !== 'api.frankfurter.dev') {
    return null;
  }

  const base = url.searchParams.get('base') ?? url.searchParams.get('from');
  const symbols = (url.searchParams.get('symbols') ?? url.searchParams.get('to') ?? '')
    .split(',')
    .filter(Boolean);
  const date = /\d{4}-\d{2}-\d{2}/.exec(url.pathname)?.[0] ?? new Date().toISOString().slice(0, 10);
  const rates = Object.fromEntries(symbols.map((symbol) => [symbol, testRate(base, symbol)]));

  return new Response(JSON.stringify({ amount: 1, base, date, rates }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
