<div align="center">

# FinVision

**An integrated personal finance platform for Gen Z — budgeting, investment simulation, financial education, and an AI assistant, unified in one place.**

![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.21-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)
![Gemini](https://img.shields.io/badge/AI-Google_Gemini-4285F4?logo=google&logoColor=white)

</div>

---

## Table of Contents

- [The Problem](#the-problem)
- [Research Foundation](#research-foundation)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Engineering Highlights](#engineering-highlights)
- [Data Model](#data-model)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Testing](#testing)
- [Security](#security)
- [Known Limitations](#known-limitations)
- [Disclaimer](#disclaimer)
- [Academic Context](#academic-context)

---

## The Problem

Young people today have no shortage of financial information — what they lack is a coherent place to act on it. Someone trying to manage their money typically ends up juggling four disconnected tools: one app for tracking expenses, a second for market news, a third for learning the basics, and a fourth if they want to try investing. Nothing talks to anything else.

That fragmentation has concrete consequences: no unified view of one's finances, high friction from switching between apps, and a drop-off rate that hits beginners hardest. FinVision was built to close that gap.

## Research Foundation

Rather than assuming which problems mattered most, the requirements were grounded in original research.

A cause-and-effect (Ishikawa) analysis first mapped the factors behind low financial literacy across six categories: education system, digital resources, family environment, financial market, economic context, and individual behaviour. A survey of **55 respondents** (78% students, 73% aged 18–22) then quantified those factors, and the results were ranked using **Pareto analysis**.

The top seven problems accounted for roughly **75% of all high-severity mentions**:

| Rank | Problem | Respondents (rated 4–5) |
|---|---|---|
| 1 | No practical financial education in school | 30 (54.5%) |
| 2 | Lack of starting capital | 29 (52.7%) |
| 3 | Difficulty juggling multiple separate apps | 28 (50.9%) |
| 4 | Cost of premium financial apps | 28 (50.9%) |
| 5 | Not knowing how much income to allocate | 28 (50.9%) |
| 6 | Fragmented financial tools | 25 (45.5%) |
| 7 | No access to courses or materials | 22 (40.0%) |

Three of the top six relate directly to tool fragmentation, which validated the central premise of an integrated platform. **76% of respondents** (42/55) said they would use such a solution.

## Features

### Budget Management
- Full transaction CRUD for income and expenses, with system and user-defined categories
- Filtering and sorting by date, amount, type, and category
- **Recurring transactions** across five frequencies (daily, weekly, biweekly, monthly, annually) with an optional end date; the system stores only the next occurrence rather than pre-generating every future entry
- Monthly budget goal with live remaining-budget tracking, computed over strict UTC month boundaries to avoid timezone edge cases
- Category distribution and cash-flow charts
- CSV export prefixed with a UTF-8 BOM so diacritics render correctly in Excel

### Investment Simulation
Two symmetric modules — **Invest** (crypto) and **Market** (stocks) — each with two distinct modes:

- **Demo Practice** — a configurable virtual balance (default €5,000), fully detached from real finances
- **Start Investing** — starts at €0 and grows only from amounts allocated in the budget module, tying simulated capital to actual saving discipline

Both support asset search, live pricing, buy/sell simulation, portfolio performance tracking via daily snapshots, and trade history export.

### Finny — the AI Assistant
Built on Google Gemini and available both as a dedicated page and a persistent global widget:

- **Topic guard** — every message is screened for domain scope and intent before any external call. Off-topic requests return a predefined response with zero API cost and near-zero latency.
- **Structured local answers** — the most common questions (budget check, top spending categories, 30-day habit review, saving tips, net worth) are answered directly from the user's own data as structured cards, bypassing the model entirely. Faster, cheaper, and immune to hallucination.
- **Minimized context** — only the data relevant to the detected intent is sent to the model, never the user's full history.
- **No investment advice** — buy/sell recommendations are excluded by design.

### Learning Center
- Structured articles organized by topic, addressable by both ObjectId and URL slug
- Topic quizzes with scoring, pass thresholds, and automatic next-quiz recommendation that excludes recently attempted quizzes
- XP and leveling system with streak tracking, using a get-or-create pattern so progress documents are provisioned lazily on first access

### Financial News
- Aggregated via MarketAux, filterable by theme (macro, investing, crypto)
- Links out to original sources rather than reproducing article text
- Language detected from the `Accept-Language` header

### Account & Preferences
- Partial profile updates — only fields explicitly sent are modified
- Secure password change requiring current-password verification
- Light/dark mode, RO/EN localization, RON/EUR/USD currency support

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| **Frontend** | React | 18.3.1 |
| | TypeScript | 5.7.2 |
| | Vite | 6.0.7 |
| | Tailwind CSS | 3.4.17 |
| | React Router DOM | 6.30.1 |
| | Chart.js | 4.5.1 |
| **Backend** | Node.js | 18+ |
| | Express | 4.21.2 |
| | Mongoose | 8.9.0 |
| | Zod | 3.24.1 |
| | jsonwebtoken | 9.0.2 |
| | bcryptjs | 2.4.3 |
| | Helmet | 8.1.0 |
| | `@google/genai` | 1.47.0 |
| **Database** | MongoDB Atlas | 6.0 |

**External services:** CoinGecko (crypto pricing) · Finnhub (stock quotes) · Stooq & Yahoo Finance (historical fallback) · Frankfurter (FX rates, ECB-based) · MarketAux (financial news) · Google Gemini (AI assistant)

## Architecture

FinVision uses a **client-server architecture** — not MVC. The React SPA and the Node.js/Express backend run as independent applications communicating over HTTPS through a versioned REST API (`/api/v1/`).

```
┌─────────────────────┐
│   Browser           │
│   React SPA (TS)    │
└──────────┬──────────┘
           │ HTTPS
┌──────────▼──────────┐        ┌──────────────────────┐
│  Application Server │◄──────►│  External APIs       │
│  Node.js + Express  │ HTTPS  │  CoinGecko, Finnhub, │
│  routes/v1 +        │        │  MarketAux, Gemini,  │
│  integrations       │        │  Frankfurter, Stooq  │
└──────────┬──────────┘        └──────────────────────┘
           │ HTTPS/TLS
┌──────────▼──────────┐
│  MongoDB Atlas      │
│  Mongoose ODM       │
│  16 collections     │
└─────────────────────┘
```

The backend is organized as a **modular monolith**: it deploys as a single service, but each domain (auth, budget, transactions, invest, market, finny, education, news, profile, exports) owns its own routes, models, and validation schemas, keeping coupling low and making later extraction straightforward.

Every third-party integration lives behind a dedicated client in `server/src/integrations/`. This isolation kept two mid-project provider migrations (GDELT → MarketAux, OpenAI → Gemini) contained to a single file each, with no architectural changes.

## Engineering Highlights

The pieces that took the most thought:

**Cascading provider fallback.** Finnhub's free tier returns `403` for extended historical candle data. When it does, the system falls back to Stooq, then Yahoo Finance, gated behind an environment flag (`ENABLE_FINNHUB_CANDLES_FALLBACK`) so providers can be switched without touching code.

**Forward-fill price resolution.** Market data has gaps — weekends, holidays, provider outages. Portfolio performance charts use a daily resolver that propagates the last known price into missing days, producing continuous lines without inventing interpolated values between real trade points.

**Request coalescing.** When two identical news requests arrive before the first provider response returns, the second attaches to the in-flight promise instead of triggering a duplicate external call. Paired with a 10-minute TTL cache, this keeps free-tier usage well within limits.

**UTC-normalized financial math.** Transactions are stored with UTC timestamps, and every calendar-boundary calculation constructs its range explicitly in UTC. Without this, transactions near midnight were being included or excluded depending on server timezone.

**Two-stage AI gating.** The topic guard runs before any model call, and five common intents are served entirely from local data. Most user questions never reach Gemini at all.

## Data Model

16 MongoDB collections across three domains — budgeting, investing, and education — modeled as UML class diagrams with a `«collection»` stereotype rather than classic ERD, reflecting their document-oriented nature.

Relationships use **`ObjectId` referencing rather than embedding**. That choice was deliberate: transaction and trade documents grow without bound (embedding risks MongoDB's 16 MB per-document limit), child collections are queried independently of their parent, categories participate in many-to-many relationships across transactions, and updating a referenced document happens in one place rather than across every copy.

Every user-owned collection carries a `userId` field, and queries filter on it at the data-access layer, enforcing ownership before business logic runs.

## Project Structure

```
server/src/
├── errors/          custom error classes
├── integrations/    clients for external services
├── middleware/      auth, validation, logging, error handling
├── models/          Mongoose schemas (16 collections)
├── modules/         domain logic (finny, insights)
├── routes/v1/       endpoints grouped by feature
├── utils/           shared utilities
└── validation/      Zod schemas per module

server/test/
├── unit/            isolated logic (topic guard, validation)
└── integration/     full request/response flows

client/src/
├── components/      reusable UI components
├── context/         AuthContext and other providers
├── lib/             api.ts — centralized typed HTTP layer
├── pages/           one page per feature module
└── routes/          ProtectedRoute, ErrorBoundary
```

## Getting Started

### Prerequisites

- Node.js 18 or higher
- MongoDB (local instance or Atlas cluster)
- API keys for Finnhub, MarketAux, and Google Gemini (CoinGecko and Frankfurter need none for basic use)

### Installation

```bash
git clone https://github.com/<your-username>/finvision.git
cd finvision

cd server && npm install
cd ../client && npm install
```

### Environment Variables

Create `server/.env`:

```env
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret

FINNHUB_API_KEY=your_finnhub_key
MARKETAUX_API_KEY=your_marketaux_key
GEMINI_API_KEY=your_gemini_key

ENABLE_FINNHUB_CANDLES_FALLBACK=true
```

### Running Locally

```bash
# Terminal 1 — backend
cd server && npm run dev

# Terminal 2 — frontend
cd client && npm run dev
```

## Testing

Tests run on Node's native test runner with Supertest for HTTP-level assertions and `mongodb-memory-server` for an isolated in-memory database — no real MongoDB instance required, and the database resets before every test.

```bash
cd server
npm test
```

- **Unit tests** — isolated logic such as the Finny topic guard, verifying that off-topic messages are blocked and that in-scope intents classify correctly
- **Integration tests** — full flows including auth with request-ID propagation, transaction creation with sorting and date-range filtering, and budget summary calculation
- **Smoke tests** — one end-to-end path covering register, login, protected route access, transaction creation, and the Finny chat endpoint

The Finny topic-lock tests specifically assert that out-of-scope messages are refused **without any provider dependency**, so the refusal path stays fast and deterministic regardless of Gemini's availability.

## Security

- bcrypt password hashing with a cost factor of 12
- Stateless JWT authentication; tokens signed with a server-side secret
- Identical error responses for unknown email and wrong password, avoiding account enumeration
- Ownership enforced at query level — cross-user resource access returns `404`, not `403`, so resource existence isn't leaked
- Helmet security headers and a strict CORS policy limited to the known client origin
- Per-user rate limiting on AI requests (5 per minute)
- All third-party API keys held server-side; none reach the frontend bundle

## Known Limitations

Stated plainly, since they're real:

- **Historical stock data coverage is incomplete.** Finnhub's free tier doesn't cover extended candle ranges, and the Stooq/Yahoo fallback doesn't resolve every ticker. Affected symbols show an explicit unavailability message rather than a broken chart.
- **Rate limiter state is in-memory.** It resets on server restart, so a user who had hit the limit can immediately send five more requests. Persisting it to Redis or MongoDB is the natural fix.
- **No automated frontend tests.** Interactions between global auth state, preferences, and the investment modules are verified manually against usage scenarios. End-to-end coverage with Playwright is the obvious next step.

## Disclaimer

FinVision is an educational project. The investment modules operate on virtual funds using historical or delayed market data; they are not connected to any brokerage and execute no real trades. Finny is scoped to educational and informational responses and is explicitly designed not to provide investment advice or buy/sell recommendations.

## Academic Context

Developed as a bachelor's thesis at **Babeș-Bolyai University**, Faculty of Economics and Business Administration (FSEGA), Economic Informatics program, Cluj-Napoca.

The written thesis covers business analysis (Fishbone, Pareto, BPMN As-Is/To-Be), design (UML use case, deployment, component and class diagrams, DFD), implementation with documented algorithms in pseudocode, and a testing and evaluation chapter.
