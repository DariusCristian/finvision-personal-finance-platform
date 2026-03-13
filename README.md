# FinVision

FinVision is a MERN web app for budget tracking, learning, and investing simulations.

## Stack

- `client/`: React + Vite + TypeScript + Tailwind
- `server/`: Node.js + Express + MongoDB (Mongoose, `.js` only)
- `docs/`: architecture decisions (ADRs)

## Project Structure

```text
finvision/
  client/
  server/
  docs/
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create environment files:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

3. Configure `server/.env`:
- `MONGODB_URI` (Atlas or local MongoDB)
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `PORT` (default local may be `5001` on macOS if `5000` is occupied)

## Run

```bash
npm run dev
```

- Server: `http://localhost:5001` (or your configured `PORT`)
- Client: `http://localhost:5173`

## How It Works

### Request lifecycle

1. `requestId` middleware generates or forwards `x-request-id`.
2. request logger writes structured JSON logs with redacted sensitive headers.
3. request payloads are validated by Zod via `validateRequest` middleware.
4. route handlers execute domain logic (auth, categories, transactions, profile).
5. success responses use a consistent envelope: `{ success, data, meta, requestId }`.
6. errors pass through centralized error middleware and return:
   `{ success: false, error: { code, message, details }, requestId }`.

### Budget module data flow

- Categories: system + user custom categories.
- Transactions: one-time and recurring with projection support for future months.
- Aggregations (KPI + charts) are derived on the client from transaction payloads.

### Learning Center module data flow

- Articles and quizzes are stored in MongoDB and exposed under `/api/v1/education`.
- Quiz scoring and answer explanations are computed server-side.
- User progress tracks XP, level, completed articles, and recent quiz attempts.

## API Overview

### Health
- `GET /healthz`
- `GET /api/v1/ping`

### Auth
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me` (auth required)

### Categories
- `GET /api/v1/categories` (auth required)
- `POST /api/v1/categories` (auth required)

### Transactions
- `GET /api/v1/transactions` (auth required)
  - filters: `from`, `to`, `type`, `categoryId`, `search`
  - sorting: `sort=date|-date|amount|-amount`
  - pagination: `page`, `limit`
- `POST /api/v1/transactions` (auth required)
- `PATCH /api/v1/transactions/:transactionId` (auth required)
- `DELETE /api/v1/transactions/:transactionId` (auth required)

### Profile
- `PATCH /api/v1/profile/budget-goal` (auth required)
- `PATCH /api/v1/profile/investing` (auth required)

### Education
- `GET /api/v1/education/articles`
- `GET /api/v1/education/articles/:idOrSlug`
- `POST /api/v1/education/articles/:id/complete` (auth required)
- `GET /api/v1/education/quizzes`
- `GET /api/v1/education/quizzes/:id`
- `POST /api/v1/education/quizzes/:id/attempts` (auth required)
- `GET /api/v1/education/progress` (auth required)

### News (GDELT DOC 2.0, public)
- `GET /api/v1/news`
  - filters: `topic=all|budgeting|investing|crypto|macro`, `q`, `page`, `limit`
  - example:
    `curl "http://localhost:5001/api/v1/news?topic=all&limit=12&page=1"`

## Seed Education Content

Populate demo Learning Center content (articles + quizzes + questions):

```bash
npm run seed:education --workspace finvision-server
```

The script is idempotent and can be re-run safely.

## Testing

### Server tests

- Unit tests: schema/validator/helper behavior
- Integration tests: auth + transactions APIs with Supertest and in-memory MongoDB

Run all server tests:

```bash
npm run test --workspace finvision-server
```

Run from root:

```bash
npm run test
```

## Lint and format

```bash
npm run lint
npm run format
```

## Verify

```bash
curl http://localhost:5001/healthz
curl http://localhost:5001/api/v1/ping
curl "http://localhost:5001/api/v1/news?topic=all&limit=12&page=1"
```

Then open:
- `http://localhost:5173`
- `http://localhost:5173/login`

## Troubleshooting

- If `5000` is already in use on macOS, run with:

```bash
PORT=5001 VITE_API_BASE_URL=http://localhost:5001 npm run dev
```
