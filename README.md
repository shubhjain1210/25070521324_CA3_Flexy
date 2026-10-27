# MovieBox (local demo)

## Requirements
- Node.js 20+ (Node 26 should work)
- MongoDB Community Server running locally

## Start backend
From this extracted project's `moviebox` directory:
```bash
cd backend
cp .env.example .env
# Edit .env and set a unique JWT_SECRET before any non-local deployment.
npm install
npm run seed
npm run dev
```

## Start frontend (new Terminal tab)
```bash
cd /absolute/path/to/moviebox/frontend
npm install
npm run dev
```
Open http://localhost:5173.

## Security checks
- Registration and login are public by design; movie catalogue, movie details, watchlists, reviews, and admin APIs require a valid httpOnly JWT cookie.
- Admin APIs additionally require the admin role.
- Login/register attempts are throttled in memory for this single-instance demo.
- Do not expose this demo to the public internet without production hardening (HTTPS, strong JWT_SECRET, persistent rate-limit store, CSRF strategy, backups, and review of admin account provisioning).
- The seed script creates a local demo admin account only if one does not exist: `admin@moviebox.local` / `MovieBoxDemo123!`. Change/remove it before using this app beyond local testing.
- Run `npm run seed` again to add/update the catalogue. Existing entries are updated by slug; unrelated movies are not deleted.

## Troubleshooting
- `ERR_CONNECTION_REFUSED` means the Vite frontend or Express backend is not running.
- Run `pwd` before `npm install` to ensure Terminal is inside the `frontend` or `backend` folder, not `Downloads`.
- If security changes do not appear, stop both old servers with Ctrl+C and run this extracted folder's frontend and backend.
