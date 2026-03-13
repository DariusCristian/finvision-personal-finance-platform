# FinVision Architecture Decisions

## ADR-001: Modular monolith for thesis delivery

- **Decision:** Start with a modular monolith backend.
- **Why:** Domain boundaries stay explicit for thesis analysis while avoiding microservice operational overhead.
- **Tradeoff:** Less independent deployment flexibility than distributed services.

## ADR-002: MERN stack in a monorepo

- **Decision:** Use MongoDB, Express, React, and Node.js with separate `server/` and `client/` apps.
- **Why:** Clear ownership between API and UI, strong ecosystem support, and fast local development.
- **Tradeoff:** Requires CORS and cross-app environment coordination.

## ADR-003: MongoDB + Mongoose from day 1

- **Decision:** Use Mongoose for MongoDB modeling and connectivity.
- **Why:** Rapid schema iteration and Atlas-ready setup for thesis prototyping.
- **Tradeoff:** Needs disciplined schema governance as project complexity grows.

## ADR-004: Server in JavaScript (`.js`) only

- **Decision:** Keep backend source in plain Node.js JavaScript.
- **Why:** Lower setup overhead and faster onboarding for thesis milestones under time constraints.
- **Tradeoff:** Fewer compile-time guarantees compared to TypeScript.

## ADR-005: Zod at API boundaries

- **Decision:** Validate request payloads with Zod schemas per endpoint and a shared middleware.
- **Why:** Consistent input contracts, clearer error details, safer route handlers.
- **Tradeoff:** Requires explicit schema maintenance as endpoints evolve.

## ADR-006: Structured logs + request ID propagation

- **Decision:** Use structured JSON logs and propagate `x-request-id` through all requests/responses.
- **Why:** Easier debugging, better traceability, and cleaner production diagnostics.
- **Tradeoff:** Slightly more verbose middleware and logger plumbing.

## ADR-007: Test strategy (unit + API integration)

- **Decision:** Combine unit tests for validators/helpers with integration tests using Supertest and in-memory MongoDB.
- **Why:** Fast feedback on critical backend behavior without requiring a shared external DB.
- **Tradeoff:** Integration tests are slower than pure unit tests and need isolated runtime setup.
