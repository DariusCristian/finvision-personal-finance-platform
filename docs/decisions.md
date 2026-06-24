# FinVision — Architecture & Decision Reference

A comprehensive record of every meaningful decision made in building this platform.
Organized by concern so you can look up any area independently.

---

## 1. Project Context

FinVision started as a thesis project built under time constraints, so every early choice
prioritized speed of development and clarity of domain boundaries over future scalability.
The platform is a personal finance app covering budgeting, investing simulation, market data,
learning content, and an AI assistant (Finny). All code lives in one repository.

---

## 2. Repository Layout

**Decision:** npm workspaces monorepo with two packages: `server/` and `client/`.

The root `package.json` declares `"workspaces": ["client", "server"]` and holds scripts
that run both apps together with `concurrently`. The only shared runtime dependency at root
level is `@google/genai` (the Gemini SDK), which the server consumes.

Running `npm run dev` from the root starts:
- Server on port **5001** (`node --watch src/index.js`)
- Client on port **5173** (`vite --port 5173`)

**Why:** A single `npm install` from root installs everything. The two apps stay completely
separate (no shared source) but coordinate through one `package.json` and one git repository.
CORS is the only coordination overhead: the client origin must be listed in `CORS_ORIGINS`.

---

## 3. Tech Stack

### 3.1 Backend

| Layer | Choice | Reason |
|---|---|---|
| Runtime | Node.js v24 | LTS with native test runner, `--watch` flag, full ESM support |
| Module system | ESM (`"type": "module"`) | Native `import/export`, no Babel needed |
| Framework | Express 4 | Minimal, well-understood, fits the one-developer context |
| Validation | Zod | Runtime type safety at API boundaries with excellent error messages |
| ORM | Mongoose 8 | Schema enforcement on top of MongoDB; fast iteration on schema design |
| Auth tokens | jsonwebtoken | Stateless JWT, no session store needed |
| Password hashing | bcryptjs | Pure-JS bcrypt, no native build step required |
| Security headers | Helmet | One-liner hardening for common web vulnerabilities |
| Logging | Custom structured JSON logger + `x-request-id` propagation |
| Config validation | Zod on `process.env` at startup — server crashes immediately on bad config |

**Why JavaScript (not TypeScript) on the server:** Lower setup overhead during thesis
milestones. Zod at every route boundary provides the runtime contract guarantees that
matter most. The trade-off is fewer compile-time guarantees; this is accepted consciously.

### 3.2 Frontend

| Layer | Choice | Reason |
|---|---|---|
| Framework | React 18 with hooks | Component model fits the page-heavy UI |
| Language | TypeScript (strict) | Catch shape mismatches between API responses and UI code at build time |
| Build tool | Vite 6 | Fast HMR, minimal config, first-class React/TS support |
| Styling | Tailwind CSS 3 | Utility-first; dark mode via `class` strategy on `<html>` |
| Routing | React Router 6 | Client-side SPA routing with `BrowserRouter` |
| Charts | Chart.js 4 | Canvas-based; used for donut charts and portfolio performance |
| Virtualization | react-window | Renders only visible rows in large transaction lists |
| HTTP | Native `fetch` inside `lib/api.ts` | No Axios dependency; all calls are typed wrapper functions |

**TypeScript config decisions:**
- `target: ES2020` — matches Vite's modern browser target
- `moduleResolution: Bundler` — Vite handles resolution; enables bare specifier imports
- `noUnusedLocals: true`, `noUnusedParameters: true` — caught dead code at build time
- `strict: true` — full strict mode; `noEmit: true` means tsc is type-check only, Vite handles transpilation

---

## 4. Authentication

**Strategy:** Short-lived access tokens only. No refresh token endpoint.

- Token format: `JWT` signed with `JWT_ACCESS_SECRET` (HS256 by default in jsonwebtoken)
- Payload: `{ sub: userId }` — minimal; user data fetched fresh from DB on each request
- Expiry: **15 minutes**
- Transport: `Authorization: Bearer <token>` header
- Client-side storage: `localStorage` (key: `finvision.accessToken`)

**Auth middleware** (`requireAuth`):
1. Extracts token from `Authorization` header
2. Verifies signature and expiry
3. Fetches the user document from MongoDB by `sub`
4. Attaches full user as `req.authUser`
5. Throws `AuthError` (401) on any failure

**Why no refresh token:** No `/refresh` endpoint was built. The `JWT_REFRESH_SECRET` env var
that appeared in early config was removed because it was never consumed. When a 15-minute
token expires, the user re-authenticates. This is acceptable for a thesis/personal app.

**Why short expiry:** Reduces the window of token theft exposure on a stateless server.

---

## 5. API Design

### 5.1 URL Convention

All API routes are versioned under `/api/v1/`. A separate `/healthz` endpoint lives outside
versioning for uptime checks.

### 5.2 Request Validation

Every mutating route runs `validateRequest({ body: schema })` middleware before the handler.
Every query-bearing GET runs `validateRequest({ query: schema })`. Schemas are defined with
Zod in `server/src/validation/`. Common primitives live in `validation/common.js`:
- `objectIdSchema` — 24-char hex regex
- `currencySchema` — enum `['RON', 'EUR', 'USD']`

Validation errors surface as structured JSON with per-field `details`, not bare 400 strings.

### 5.3 Response Envelope

All successful responses use `sendSuccess(res, data, statusCode, meta)` from `utils/response.js`.
Shape: `{ success: true, data: {...}, meta: {...} }`.

### 5.4 Error Hierarchy

```
AppError (base)           — statusCode + code + details[]
  ValidationError         — 400, VALIDATION_ERROR
  AuthError               — 401, AUTH_ERROR
  ConflictError           — 409, CONFLICT_ERROR
  NotFoundError           — 404, NOT_FOUND_ERROR
  ExternalApiError        — 502, EXTERNAL_API_ERROR

Provider errors (per integration):
  FxProviderError         — Frankfurter
  FinnhubProviderError    — Finnhub
  StooqProviderError      — Stooq
  CoinGeckoProviderError  — CoinGecko
  YahooProviderError      — Yahoo Finance
  GeminiProviderError     — Gemini AI
```

Each route has a `normalizeProviderError(error)` helper that converts typed provider errors
into the appropriate `AppError` before passing to the central error handler. This ensures a
500 is never returned to the client when a provider is simply down.

### 5.5 Middleware Order (app.js)

1. `requestIdMiddleware` — attaches `x-request-id` to every request
2. `requestLoggerMiddleware` — structured log on every request
3. `helmet()` — security response headers
4. `cors(getCorsOptions(...))` — origin allowlist; supports credentials
5. `express.json({ limit: '1mb' })` — body parsing cap
6. Route handlers
7. `notFoundHandler` — 404 for unknown routes
8. `errorHandler` — central error → JSON response

---

## 6. Database

### 6.1 MongoDB + Mongoose

MongoDB was chosen for its flexible document model, which suits rapid schema iteration during
thesis development. Mongoose adds schema enforcement, index management, and lifecycle hooks
(`pre('validate')`, `pre('save')`) on top of the raw driver.

Connection string lives in `MONGODB_URI`. The server refuses to start if this is absent
(Zod validation on startup).

### 6.2 Timestamps Convention

Most models use `timestamps: true` (Mongoose adds `createdAt` + `updatedAt`).

**Exception — immutable records:** `InvestingWalletLedger`, `InvestFunding`, `PortfolioTrade`,
`PortfolioSnapshot`, and `QuizAttempt` use `timestamps: { createdAt: true, updatedAt: false }`.
These are append-only ledger records that should never be mutated after creation. Omitting
`updatedAt` makes this intent explicit at the schema level.

### 6.3 Models Reference

#### User
Core identity document. Stores hashed password, preferences, and per-user investing mode flags.

Notable fields:
- `baseCurrency: enum['RON', 'EUR', 'USD']` — default `'RON'` (Romanian context)
- `locale: enum['en-US', 'ro-RO']` — controls Finny language context
- `investCryptoMode: enum['funded', 'demo'] | null` — which investing mode is active
- `marketStocksMode: enum['funded', 'demo'] | null` — same for stocks
- `monthlyBudgetGoal` — nullable; used by budget summary calculations
- No `updatedAt` on the User model itself (uses only `createdAt`)

#### Transaction
Central record for budget tracking. Supports one-time and recurring transactions.

Notable decisions:
- `amount` is always positive; `type` ('income' or 'expense') determines the sign meaning
- `currency` stored per-transaction (not forced to user's `baseCurrency`), allowing multi-currency budgets
- `paymentMethod: enum['card', 'cash', 'bank'] | null` — optional metadata
- Recurring fields: `isRecurring`, `recurrence` (none/daily/weekly/biweekly/monthly/annually),
  `recurrenceEndDate`, `nextOccurrenceAt`
- Validation rule: if `isRecurring=true`, then `recurrence` must not be `'none'` AND
  `recurrenceEndDate` must be provided AND must be >= `date`

Recurring transactions are **not expanded in the database**. They are expanded on read by
`expandTransactionForRange()` in `routes/v1/transactions.js`. This function generates virtual
occurrences for any range, capped at **1825 iterations** (5 years of daily recurrences) to
prevent infinite loops.

Indexes: `{ userId: 1, date: -1 }` and `{ userId: 1, categoryId: 1 }`.

#### Category
User-owned or system-wide. System categories have `userId: null` and `isSystem: true`.

11 system categories are seeded on startup via `ensureSystemCategories()`:
- Expenses: Food & Dining, Transport, Housing, Entertainment, Utilities, Health, Shopping, Other, Investing
- Income: Salary, Freelance

A `pre('validate')` hook auto-generates a `slug` from `name` (lowercased, hyphenated).
Unique constraint: `{ userId, name, type }` — a user cannot have two categories with the
same name and type.

#### InvestingWallet
One wallet per user, always in RON. Acts as the staging area before funds are converted to EUR
for portfolio use.

Notable fields:
- `currency: enum['RON']` — hardcoded; the wallet is always RON
- `autoFundEnabled`, `autoFundAmount`, `autoFundDayOfMonth` (1–28), `lastAutoFundAt`
- Auto-fund triggers on wallet GET/PATCH/summary when the day-of-month has passed since last run

When funds are deposited into the wallet, `recordInvestingDepositExpense()` creates an
expense `Transaction` in the budget (under the system "Investing" category). This keeps the
budget and investing wallet synchronized — wallet deposits appear as budget outflows.

#### InvestingWalletLedger
Append-only audit log of every wallet movement.

Types: `'deposit'`, `'withdraw'`, `'fx_convert_to_eur'`, `'autofund'`.
The `meta: Mixed` field carries context (note text, FX rate used, etc.) per entry.

#### InvestFunding
Records every RON→EUR conversion that funded a portfolio top-up.
Stores `fromAmount` (RON), `toAmount` (EUR), `rate`, `mode`, and the `provider` used
for the exchange rate. Used for historical tracking of wallet-to-portfolio flows.

#### PortfolioAccount
One account per user × asset type × mode combination.
`Unique index: { userId, accountType, mode }` — exactly one funded-crypto account, one
demo-crypto account, one funded-stocks account, one demo-stocks account per user.

`baseCurrency` is always `'EUR'`. `cashBalance` (aliased `cashBalanceEUR`) is the free
EUR balance available for new trades.

Demo stocks account is initialized with **€5,000** on first creation; demo crypto and all
funded accounts start at **€0** (funded by wallet conversions).

#### PortfolioHolding
Tracks the aggregated position for one asset (one coin or one stock ticker) in a given account.

Notable decisions:
- `avgCost` aliased as `avgCostEUR` — semantic clarity in queries
- Crypto holdings require `coinId` (CoinGecko ID, e.g. `'bitcoin'`); stock holdings require
  only `symbol` (`'AAPL'`)
- A `pre('validate')` hook enforces the asset↔account consistency rule: `assetType: 'crypto'`
  must use `accountType: 'crypto'`, and `assetType: 'stock'` must use `accountType: 'stocks'`
- Partial unique indexes enforce one holding per (userId, accountType, mode, assetType, identifier):
  - Crypto: identifier = `coinId`
  - Stocks: identifier = `symbol`

#### PortfolioTrade
Immutable trade record (no `updatedAt`). Captures every buy/sell event.

Fields: `side` (buy/sell), `quantity`, `price` / `priceEUR`, `total` / `totalEUR`,
`executedAt`, and optional FX fields (`executedPriceOriginal`, `originalCurrency`, `fxRateToEur`)
for when a trade price was quoted in a currency other than EUR.

#### PortfolioSnapshot
Daily snapshot of total portfolio value, cash balance, and holdings value. Used to render
the performance chart over time.

`date` is stored as `String` in `YYYY-MM-DD` format (not a `Date` object). This was chosen
for simplicity in daily aggregation queries without timezone complexity.
Unique index: `{ userId, accountType, mode, date }`.

#### Insight
System-generated financial observations surfaced in the UI.

Types:
- `SUBSCRIPTION_NO_END` — recurring expense with no end date
- `BUDGET_PACE_WARNING` — expense-to-date pace exceeds budget goal
- `INVESTING_UNFUNDED` — wallet is empty but investing mode is active
- `PORTFOLIO_CONCENTRATION` — one asset is an outsized % of portfolio

Each insight has `whatNoticed`, `whyMatters`, `whatYouCanDo` fields (Finny-style structure)
plus `actions[]` with labels and hrefs for in-app navigation.
Status: `'active'` or `'dismissed'`.

#### Article / Quiz / Question / QuizAttempt
Learning Center content. Articles use `contentBlocks[]` to support mixed paragraph/callout/
bulletList content without a rich-text editor dependency.
Quizzes link to `Question[]` records, with `passingScore` (default 70%) on the quiz.
`QuizAttempt` records individual user quiz runs (immutable, `createdAt` only).

---

## 7. Currency & Investing Model

### 7.1 Two-Currency Architecture

The app uses a deliberate two-currency model:
- **RON** — the user's budget wallet currency. All budget transactions default to RON.
- **EUR** — the portfolio's base currency. All portfolio positions, trades, and cash are in EUR.

When a user deposits into the investing wallet, the RON balance grows.
When they top up a portfolio, RON is converted to EUR via Frankfurter, and EUR is credited to
the `PortfolioAccount.cashBalance`. The conversion event is logged in `InvestFunding`.

**Why this split:** Romanian context. Users earn/spend in RON, but crypto and stock markets
price in EUR/USD. Keeping a clear RON wallet → EUR portfolio pipeline makes the FX step
explicit rather than hiding it.

### 7.2 Funded vs Demo Modes

Every investing-related model carries a `mode: enum['funded', 'demo']` field.

- **Funded** — real money flow. Requires wallet top-ups before trades. Starts at €0.
- **Demo** — simulated. Starts with €5,000 phantom funds (stocks) or €0 + demo budget (crypto).

The user's active mode is stored on `User.investCryptoMode` and `User.marketStocksMode`.
Mode can be switched at any time; data from both modes coexists in the same collections,
always filtered by `mode` in queries.

**Why not separate collections per mode:** Single schema per entity type, simple filtered
queries, easy to add future modes. The trade-off is that every query must include `mode` in
its filter — this is enforced by always reading `mode` from `req.authUser` rather than
accepting it from the client.

### 7.3 Asset Type Separation

Crypto and stocks are kept as separate account types even though they share the same
`PortfolioAccount`, `PortfolioHolding`, `PortfolioTrade`, and `PortfolioSnapshot` schemas.
This allows independent cash balances, separate performance charts, and different data
providers per type (CoinGecko for crypto, Finnhub/Stooq/Yahoo for stocks).

---

## 8. External Integrations

All integrations follow the same pattern:
1. Typed error class (`XxxProviderError extends Error`) with `status` and `code`
2. In-memory cache with TTL and **request deduplication** (prevents stampedes on cache miss)
3. `normalizeProviderError()` in the route that maps provider errors to `AppError`

### 8.1 Frankfurter — FX Rates

- URL: `https://api.frankfurter.dev/v1`
- Used for: RON→EUR wallet-to-portfolio conversions and `/convert/quote` preview
- Timeout: 8 seconds
- Cache:
  - `getLatestRates()` — **12 hours** (currency pair rates change slowly)
  - `convert()` — **60 seconds**, keyed by currency pair only (not amount). The rate is cached;
    the converted amount is computed locally as `rate × amount`.
- Error codes: `FX_PROVIDER_ERROR`, `FX_INVALID_INPUT`, `RATE_LIMITED`
- No API key required (public API)

### 8.2 CoinGecko — Crypto Market Data

- URL: `https://api.coingecko.com/api/v3`
- Auth: `x-cg-demo-api-key` header (from `COINGECKO_API_KEY`)
- Used for: crypto search, price quotes, market chart history
- Timeout: 10 seconds
- Cache:
  - Search: 10 minutes
  - Prices: 45 seconds
  - Charts: 10 minutes
- Returns `501` to the client if `COINGECKO_API_KEY` is not configured (graceful degradation)
- Crypto prices are fixed to **EUR** in the portfolio; the `vs` parameter is validated
  server-side and overridden to `eur` if anything else is sent

### 8.3 Finnhub — Stock Market Data (Primary)

- URL: `https://finnhub.io/api/v1`
- Auth: `token` query parameter (from `FINNHUB_API_KEY`)
- Used for: stock symbol search, price quotes, company profiles, candlestick history
- Timeout: 9 seconds
- Cache:
  - Search / Profile: 24 hours (rarely changes)
  - Quote: 45 seconds
  - Candles: 10 minutes
- Returns `501` if not configured
- Candles fallback: controlled by `ENABLE_FINNHUB_CANDLES_FALLBACK` env flag (defaults false).
  When disabled, the route skips Finnhub candles and goes directly to Stooq/Yahoo.

### 8.4 Stooq — Stock History (Secondary Fallback)

- Used as a second source for historical OHLC data when Finnhub candles are disabled
  or return no data
- Returns CSV; the client parses it into `{ t, c }` series
- No API key required

### 8.5 Yahoo Finance — Stock Chart History (Tertiary Fallback)

- URL: `https://query1.finance.yahoo.com/v8/finance/chart/`
- No API key; uses a Chrome-like `User-Agent` header to avoid being blocked
- Timeout: 10 seconds
- No caching in the client itself (the route layer caches the composed response)
- Range mappings: `1D → 5d/1h`, `1W → 1mo/1d`, `1M → 1mo/1d`, `6M → 6mo/1d`,
  `1Y → 1y/1d`, `ALL → 5y/1d`
- Used as final fallback after Stooq

**Provider waterfall for stock charts:** Finnhub candles → Stooq → Yahoo. The route
assembles all three results and returns whichever has data, with provider metadata for debugging.

### 8.6 MarketAux — Financial News

- Used by the `/news` route
- Requires `MARKETAUX_API_KEY`
- Returns article headlines with source, sentiment, and entity data
- Gracefully degrades when key is absent

### 8.7 GDELT — News Fallback

- Used as a fallback when MarketAux returns no results or is unconfigured
- Public API, no key required

### 8.8 Google Gemini — AI (Finny)

- SDK: `@google/genai` (`GoogleGenAI`)
- Model: **`gemini-2.5-flash`**
- Auth: API key from environment (`GEMINI_API_KEY` or Application Default Credentials via SDK)
- Response format: `application/json` (forced via `responseMimeType`)
- Timeout: 20 seconds
- Retry: up to **3 attempts** with 400 ms × attempt delay on retryable errors
  (408, 429, 500, 502, 503, 504; also matches "overload", "rate limit", "resource exhausted"
  in the error message — the free tier throws these strings without numeric codes)
- System instruction is passed as Gemini's `config.systemInstruction` field

**Why Gemini and not OpenAI:** Replaced during development. The `OPENAI_API_KEY` and
`OPENAI_MODEL` config vars that appear in early git history were removed once Gemini was
adopted. No OpenAI code remains in the codebase.

---

## 9. Finny AI Architecture

Finny is the in-app financial assistant. It runs as a server-side chat endpoint
(`/api/v1/finny`) and a floating widget on the client.

### 9.1 Topic Guard

Every message is screened by `topicGuard.js` before reaching Gemini.
The guard uses two keyword lists:

- **Allowlist** (~97 keywords): finance, investing, budget, crypto, stocks, subscriptions,
  loans, debt, net worth, Romanian equivalents (economi, buget, cheltui, etc.)
- **Blocklist** (~25 keywords): sports, politics, celebrities, recipes, weather, general trivia

`isInScope(message)` = has ≥1 allowlist match AND zero blocklist matches.
Off-topic messages return a canned "Finny can only help with finance topics" response
without ever hitting Gemini. This saves API cost and keeps the assistant focused.

### 9.2 Intent Classification

For in-scope messages, `classifyIntent()` maps the message to one of 8 intents (priority-ordered):

1. `SUBSCRIPTIONS_REVIEW` — subscription/recurring keywords
2. `NET_WORTH` — wealth, assets, balance sheet keywords
3. `TOP_SPENDING_CATEGORIES` — spending category analysis
4. `HABIT_IMPROVEMENT_30D` — habit improvement, last 30 days
5. `SAVING_TIPS` — saving, reduce expenses, emergency fund
6. `BUDGET_CHECK` — budget, income vs expenses
7. `APP_USAGE` — app features, navigation
8. `FINANCE_EDUCATION` — general finance education (catch-all)

The intent determines:
- Which financial context to fetch from the database (budget summary, portfolio holdings, etc.)
- Which system prompt variant to send to Gemini
- Whether to allow detailed spending pattern access

### 9.3 Context Building

Before calling Gemini, the server assembles a JSON context object containing:
- User profile (locale, base currency, monthly budget goal)
- Budget summary for the current month (income, expenses, remaining, pace)
- Investing snapshot (crypto/stocks portfolio value and cash balances)
- Relevant transactions or holdings depending on intent
- App navigation hints (for `APP_USAGE` intent)

This context is serialized as JSON and appended to the prompt.

### 9.4 Response Formats

Gemini returns structured JSON. The route maps the response into one of three formats
based on the `format` field in the reply:
- `"text"` — plain assistant message rendered by `FinnyTextMessage`
- `"card"` — structured financial card (`FinnyCard`) with sections and action buttons
- `"insight_card"` — insight-style card (`InsightCard`) with noticed/matters/action blocks

### 9.5 Widget Routing

The `FinnyWidget` floating button is rendered at root level via `createPortal` into `document.body`.
It is hidden on `/finny`, `/login`, and `/register` routes.
The full Finny page (`/finny`) is a dedicated chat interface with message history.

### 9.6 Net Worth Calculation

Finny's net worth snapshot is computed server-side as:

```
net worth estimate = budget balance (income − expenses this month)
                   + crypto portfolio value
                   + crypto cash balance
                   + stocks portfolio value
                   + stocks cash balance
```

Liabilities are not tracked in FinVision and are noted as such in Finny's response.
This is an estimate, not a true balance sheet.

---

## 10. Budget & Investing Integration

When money flows into the investing wallet (deposit or auto-fund), `recordInvestingDepositExpense()`
creates an expense `Transaction` in the budget under the system "Investing" category.
This ensures that budget totals reflect outflows to the investing wallet — the two
systems stay financially consistent without any manual reconciliation.

The same behavior applies to auto-fund (monthly recurring deposit): after the ledger entry
is written, the budget expense is recorded.

---

## 11. Caching Strategy

All in-memory caches share the same pattern in `frankfurterClient.js`, `finnhubClient.js`, etc.:

```js
const cacheStore = new Map();       // cacheKey → { value, expiresAt }
const inFlightStore = new Map();    // cacheKey → Promise
```

On cache miss, the resolver is called once and its Promise stored in `inFlightStore`.
Any concurrent callers for the same key await the same Promise (request deduplication).
On resolve, the result is written to `cacheStore` and the in-flight entry is deleted.

This is a process-level cache (not Redis). It resets on server restart and does not
synchronize across multiple server processes. Acceptable for a single-instance thesis app.

**TTL summary:**
| Resource | TTL |
|---|---|
| FX latest rates | 12 hours |
| FX conversion rate (per pair) | 60 seconds |
| Stock symbol search / profile | 24 hours |
| Stock quote | 45 seconds |
| Stock candles | 10 minutes |
| Crypto search | 10 minutes |
| Crypto prices | 45 seconds |
| Crypto chart | 10 minutes |

---

## 12. Theme System

Tailwind CSS is configured with `darkMode: 'class'`. The `.dark` class on `<html>` activates
all `dark:` variants.

Three theme values: `'light'`, `'dark'`, `'system'`.

`'system'` resolves to light or dark by reading `window.matchMedia('(prefers-color-scheme: dark)')`.

The active theme is persisted in `localStorage` under the key `'theme'`. On hard reload,
`initTheme()` runs before React mounts (injected in `index.html`) to apply the class
synchronously, preventing a flash of the wrong theme.

`ThemeContext` exposes `theme`, `toggleTheme` (cycles light↔dark), and `setTheme(theme)`
(directly set any value including `'system'`). The Settings page uses `setTheme` to show
a three-button picker: Light / Dark / Follow system.

---

## 13. Frontend Page Architecture

Pages live in `client/src/pages/`. Each page that uses the top nav wraps its content in
`<AppShell activeTab="...">`. `activeTab` is optional — pages with no matching nav item
(Finny, Assistant) omit it.

Nav items (in order): Home, Budget, Invest, Market, Learning Center, News.

Context providers (in `App.tsx`):
1. `BrowserRouter` — routing
2. `AuthProvider` — user session, access token
3. `ThemeProvider` — theme state and toggle

`ProtectedRoute` wraps all authenticated pages. It reads from `AuthContext` and redirects
to `/login` if no valid session exists.

The API layer lives entirely in `client/src/lib/api.ts`: one typed async function per
endpoint. Components never call `fetch` directly.

---

## 14. Testing

**Test runner:** Node.js built-in (`node --test`), no Jest.
All tests live in `server/test/`.

**Test types:**
- `test/unit/` — isolated logic tests (Zod schemas, topic guard, FX convert math)
- `test/integration/` — full HTTP tests using Supertest + `mongodb-memory-server`

Integration tests spin up a real Express app and an in-memory MongoDB instance.
No mocking of the database layer — tests hit actual Mongoose models.
External API calls (Finnhub, CoinGecko, etc.) are either mocked via `global.fetch`
override or skipped in tests that don't exercise those paths.

Concurrency: `--test-concurrency=1` (serial) to avoid port conflicts between integration
test suites.

---

## 15. Deprecated & Removed Decisions

These decisions were made and then reversed. Kept here so you know what was tried.

- **`JWT_REFRESH_SECRET` / refresh endpoint** — planned, config was written, never implemented.
  The secret was removed from `env.js` in the cleanup pass.
- **OpenAI integration** — `OPENAI_API_KEY` and `OPENAI_MODEL` (`gpt-4.1-mini`) were
  configured. Replaced by Google Gemini. All OpenAI config and code was removed.
- **`applyInvestingBalanceDelta` in transactions.js** — early design had transactions
  directly mutating the user's `investingAccountBalance` field. This was removed when
  `InvestingWallet` became the dedicated model. The mutations were silently no-ops due to
  Mongoose strict mode (the field existed on `User` but the writes targeted a non-schema path).
- **`backfillInvestFundingMode`** — a one-shot migration function on `InvestFunding` model.
  Was called on startup to add the `mode` field to documents that existed before the field
  was added. Removed after all documents were migrated.
- **Double-mount of `marketStocksRouter`** — the router was registered at both
  `/api/v1/market` and `/api/v1/market/stocks`. The `/api/v1/market` mount was removed.
- **Double sort in BudgetPage** — transactions were sorted on write to state AND again
  in the `visibleTransactions` memo. The write-time sort was removed.
- **`utils/money.ts`** — a duplicate `formatMoney` implementation using OS locale
  (`Intl.NumberFormat(undefined, ...)`). Replaced with `lib/formatters.ts` which forces
  `en-US` for consistent rendering. The duplicate file was deleted.
- **Finny `.jsx` + `.d.ts` stub pattern** — `FinnyWidget`, `FinnyCard`, `InsightCard`,
  and `FinnyTextMessage` were plain JSX files with manually maintained `.d.ts` type stubs.
  Converted to `.tsx` with inline types; stubs deleted.
- **`/convert` POST and `/topup` POST** — deprecated routes that immediately threw 410.
  Both still had `validateRequest()` middleware running before the throw, doing useless
  validation work. Simplified to minimal `requireAuth` + direct `next(new AppError(...))`.
