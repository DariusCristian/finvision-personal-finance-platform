# Dev Notes

## Run Locally

### 1) Install dependencies
```bash
npm install
```

### 2) Required environment variables (server/.env)
```env
PORT=5001
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/finvision
JWT_ACCESS_SECRET=replace_me
JWT_REFRESH_SECRET=replace_me
CORS_ORIGINS=http://localhost:5173
```

Optional API keys:
- `MARKETAUX_API_KEY`
- `FINNHUB_API_KEY`
- `COINGECKO_API_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (default `gpt-4.1-mini`)

### 3) Start server + client
```bash
npm run dev
```

Server: `http://localhost:5001`
Client: `http://localhost:5173`

## Tests

### Server lint
```bash
npm run lint --workspace finvision-server
```

### Full server tests
```bash
npm run test --workspace finvision-server
```

### Smoke test only
```bash
cd server
node --test --test-concurrency=1 "test/integration/smoke-core.integration.test.js"
```

### Client lint/build
```bash
npm run lint --workspace finvision-client
npm run build --workspace finvision-client
```

## Quick Manual Verification
1. Login with a valid account.
2. Open `/budget` and confirm transactions/categories load.
3. Create one expense transaction.
4. Open Finny widget and send `Check my budget for this month`.
5. Open `/finny` page and verify chat still works.
6. Confirm widget is hidden on `/finny`, `/login`, `/register`.
