# my-nail-spa-backend

Node.js (Express) backend for the `my-nail-spa` frontend.

## Setup

1. Copy `.env.example` to `.env` and fill values.
	- If you use a named instance like `SQLEXPRESS`, set `DB_INSTANCE=SQLEXPRESS`.
	- For named instances, avoid forcing `DB_PORT` unless your instance is configured to use a fixed port.
2. Install deps:

```bash
npm install
```

3. Start dev server:

```bash
npm run dev
```

API base: `http://localhost:5000/api`

## Notes
- Uses SQL Server via `mssql`.
- Uses JWT auth (Authorization: Bearer <token>).
