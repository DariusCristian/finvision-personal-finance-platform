# FinVision

**An integrated personal finance platform for Gen Z: budgeting, investment simulation, financial education, and an AI-powered assistant, all in one place.**

![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.21-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## About

Most young people trying to manage their money end up juggling several disconnected tools: one app for tracking expenses, another for financial news, a third for learning the basics, and yet another if they want to try investing. FinVision was built to solve that fragmentation by bringing budgeting, investment simulation, financial education, market news, and a context-aware AI assistant into a single, coherent platform.

The project was developed as a bachelor's thesis at Babeș-Bolyai University (Faculty of Economics and Business Administration, Economic Informatics program), with a strong emphasis on demonstrating real software engineering practice: modular architecture, automated testing, and integration with multiple third-party services.

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Testing](#testing)
- [Data Model](#data-model)
- [Security](#security)
- [Disclaimer](#disclaimer)
- [Academic Context](#academic-context)
- [License](#license)

## Features

### Budget Management
- Full transaction CRUD (income and expenses) with custom and default categories
- Recurring transactions (daily, weekly, biweekly, monthly, annually) with automatic next-occurrence calculation
- Monthly budget summary with spending totals and remaining budget
- Distribution and cash-flow charts
- CSV export with UTF-8 BOM for correct diacritics in Excel

### Investment Simulation
- **Invest** module (crypto) and **Market** module (stocks), symmetric in design
- Two usage modes per module: **Demo Practice** (configurable virtual balance) and **Start Investing** (funded from the real budget)
- Live pricing via CoinGecko and Finnhub, with historical-data fallback to Stooq and Yahoo Finance
- Portfolio performance tracking via daily snapshots with forward-fill gap handling

### Finny, the AI Assistant
- Built on Google Gemini, scoped strictly to the app's financial domain via a topic-guard mechanism
- Instant, non-AI structured answers for common questions (budget check, top spending categories, saving tips, net worth) using the user's real data
- Per-user rate limiting to protect API usage
- No investment recommendations by design

### Learning Center & News
- Structured educational articles with an XP and leveling system
- Topic-based quizzes with automatic next-quiz recommendations
- Aggregated financial news via MarketAux, with in-memory caching and request coalescing

### Account & Preferences
- JWT-based authentication with bcrypt password hashing
- Partial profile updates, secure password change flow
- Light/dark mode and RO/EN localization, with RON/EUR/USD currency support

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18.3, TypeScript 5.7, Vite 6, Tailwind CSS 3.4, React Router DOM 6, Chart.js 4 |
| Backend | Node.js 18+, Express 4.21, Mongoose 8.9, Zod (validation), jsonwebtoken, bcryptjs, Helmet, CORS |
| Database | MongoDB Atlas |
| AI | Google Gemini (`@google/genai`) |
| External APIs | CoinGecko, Finnhub, Stooq, Yahoo Finance, Frankfurter, MarketAux |
| Testing | Node's native test runner, Supertest, mongodb-memory-server |

## Architecture

FinVision follows a **client-server architecture**, not the classic MVC pattern. The frontend (React SPA) and backend (Node.js/Express) run as independent applications communicating over HTTPS through a versioned REST API. The backend itself is organized as a **modular monolith**: each feature (auth, budget, invest, market, finny, education, news, exports) lives in its own route, model, and validation files, minimizing coupling between modules while running as a single deployable service.

All third-party integrations (CoinGecko, Finnhub, Frankfurter, MarketAux, Gemini) are isolated behind dedicated client wrappers on the backend, keeping API keys out of the frontend entirely.

## Project Structure

```
server/src/
├── errors/          custom error classes
├── integrations/     clients for external services
├── middleware/       auth, validation, logging, error handling
├── models/           Mongoose schemas (16 collections)
├── modules/          domain logic (finny, insights)
├── routes/v1/        endpoints grouped by feature
├── utils/            shared utilities
└── validation/       Zod schemas per module

client/src/
├── components/       reusable UI components
├── context/           AuthContext and other providers
├── lib/               api.ts, the centralized HTTP layer
├── pages/             one page per feature module
└── routes/            ProtectedRoute, ErrorBoundary
```

## Getting Started

### Prerequisites

- Node.js 18 or higher
- A MongoDB instance (local or MongoDB Atlas)
- API keys for: Finnhub, MarketAux, and Google Gemini (CoinGecko and Frankfurter do not require a key for basic usage)

### Installation

```bash
git clone https://github.com/<your-username>/finvision.git
cd finvision

# Backend
cd server
npm install

# Frontend
cd ../client
npm install
```

### Environment Variables

Create a `.env` file inside `server/` with the following (adjust names to match your actual config):

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
# Terminal 1: backend
cd server
npm run dev

# Terminal 2: frontend
cd client
npm run dev
```

## Testing

The backend includes unit, integration, and smoke tests, run with Node's native test runner and an in-memory MongoDB instance so no real database is required:

```bash
cd server
npm test
```

- **Unit tests** cover isolated logic such as the Finny topic guard
- **Integration tests** cover full request/response flows (auth, transactions, budget)
- **Smoke tests** cover the core end-to-end flow: register, login, protected routes, transactions, and the Finny chat endpoint

## Data Model

The platform uses 16 MongoDB collections grouped into three functional domains: budgeting, investing, and education. Relationships are implemented through `ObjectId` referencing rather than embedding, chosen because related documents grow without a fixed bound, are frequently queried independently of their parent, and in some cases participate in many-to-many relationships (for example, categories shared across many transactions).

## Security

- Passwords hashed with bcrypt (12 salt rounds)
- Stateless authentication via JWT
- Ownership checks enforced at the query level: users can only access their own resources
- Security headers via Helmet, strict CORS configuration
- Per-user rate limiting on AI assistant requests
- All third-party API keys held server-side only

## Disclaimer

FinVision is an educational project. The investment simulation modules use virtual funds and historical or delayed market data; they are not connected to real brokerage accounts and do not execute real trades. The Finny assistant is scoped to educational, informational responses and is explicitly designed to avoid giving investment advice or buy/sell recommendations.

## Academic Context

This project was developed as a bachelor's thesis at **Babeș-Bolyai University**, Faculty of Economics and Business Administration (FSEGA), Economic Informatics program.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
