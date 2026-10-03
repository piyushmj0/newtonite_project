# Newtonite — Operational Work Management

Newtonite is a robust, full-stack work management application designed for operational teams. It provides a reliable system of record for tracking tasks, incidents, and approvals with strong guarantees against race conditions and lost updates.

## Features

- **Concurrent-Safe Architecture**: Uses Optimistic Concurrency Control (OCC) and row-level locking to prevent lost updates and claim racing.
- **Idempotent API**: All creation endpoints utilize idempotency keys to prevent duplicate records from network retries.
- **Immutable Audit Log**: Every state change, assignment, and comment is permanently recorded in a timeline.
- **Real-time Dashboards**: Auto-refreshing UI built with React Query to keep distributed teams in sync.
- **Approval Workflows**: Built-in mechanisms for requiring and granting approvals for specific work items.

## Tech Stack

- **Backend**: Node.js, Express, SQLite (Zero Configuration), Zod (validation), JWT (Auth)
- **Frontend**: React (Vite), TanStack Query, React Router, Vanilla CSS

---

## Local Development Setup

### Prerequisites
- Node.js (v18+)

### 1. Backend & Database Setup

The backend utilizes SQLite for a zero-configuration experience. There is no need to install PostgreSQL or configure external database servers.

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure Environment Variables:
   Create a `.env` file in the `backend` directory:
   ```env
   PORT=3001
   JWT_SECRET=super_secret_jwt_key_change_in_production
   ```
4. Run Migrations and Seed Data:
   ```bash
   npm run migrate
   npm run seed
   ```
   *(This will create a `newtonite.sqlite` database file).*
5. Start the server:
   ```bash
   npm run dev
   ```
   The backend will be running at `http://localhost:3001`.

### 2. Frontend Setup

1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure Environment Variables:
   Create a `.env` file in the `frontend` directory:
   ```env
   VITE_API_URL=http://localhost:3001/api
   ```
4. Start the Vite dev server:
   ```bash
   npm run dev
   ```
   The frontend will be running at `http://localhost:5173`.

---

## Running Automated Tests

We have implemented automated tests to verify the most critical behaviors of the system, particularly the optimistic concurrency controls and authorization rules.

To run the tests, ensure your backend server is running, then execute:

```bash
cd backend
node --test tests/core.test.js
```

## Demo Accounts

If you ran the seed script (`npm run seed`), you can log in with the following demo accounts (password for all is `password123`):

- **alice@company.com** (Engineering Admin)
- **bob@company.com** (Engineering Member)
- **carol@company.com** (Operations)

---

## Architectural Documentation

For a deep dive into the system design, concurrency handling, and architectural choices, please read the [ENGINEERING_DECISIONS.md](./PROJECT_DETAILS_AND_DECISIONS.md) file.

## Known Limitations

1. **Authentication Scope**: Authentication is currently a mock JWT system for demonstration purposes without token revocation or refresh strategies.
2. **WebSocket Support**: While the frontend aggressively polls (via React Query) for updates, a true real-time scale deployment would benefit from WebSockets for lower latency updates.
3. **Pagination Offsets**: List views currently utilize `OFFSET`/`LIMIT` pagination. At tens of millions of records, this becomes inefficient and should be migrated to cursor-based pagination (Keyset pagination).
