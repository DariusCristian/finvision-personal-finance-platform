# FinVision

FinVision bachelor thesis scaffold using a pure MERN baseline.

- `client/`: React + Vite + TypeScript + Tailwind
- `server/`: Node.js + Express + MongoDB (Mongoose) in `.js`
- `docs/`: architecture decisions

## Setup

1. Install dependencies from the repo root:

```bash
npm install
```

2. Create environment files:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

3. Set `MONGODB_URI` in `server/.env` to your local MongoDB or Atlas URI.

## Run

```bash
npm run dev
```

- Server: `http://localhost:5000`
- Client: `http://localhost:5173`

## Lint and format

```bash
npm run lint
npm run format
```

## Verify

1. API health:

```bash
curl http://localhost:5000/healthz
```

Expected:

```json
{ "success": true, "data": { "status": "ok" } }
```

2. API ping:

```bash
curl http://localhost:5000/api/v1/ping
```

Expected:

```json
{ "success": true, "data": { "pong": true } }
```

3. Open `http://localhost:5173` and confirm home page shows **FinVision** and the `/login` link.

## Troubleshooting

- If port `5000` is already used on your machine, start with an override:

```bash
PORT=5001 VITE_API_BASE_URL=http://localhost:5001 npm run dev
```
