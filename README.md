# ShelfSpace

Personal reading tracker: books, articles, blogs, and podcasts in one shelf. The Node/Express app serves both the API and the web UI from `public/`.

## Run locally

1. Create a MySQL database and load `sql/schema_v2.sql` (only on a fresh machine — it drops the `shelfspace` database).
2. Copy `.env.example` to `.env` and fill in `JWT_SECRET`, `GOOGLE_CLIENT_ID`, and your MySQL settings.
3. Install and start:

```bash
npm install
npm start
```

Open http://localhost:5000

Google Sign-In needs this origin in [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → your OAuth client → **Authorized JavaScript origins**: `http://localhost:5000`

## Deploy (Railway)

This project is set up for [Railway](https://railway.app). One web service + one MySQL database is enough.

1. Push this folder to GitHub (see below).
2. On Railway: **New project** → **Deploy from GitHub repo**.
3. Add a **MySQL** database to the same project and wait until it is running.
4. In the web service **Variables**, set:
   - `JWT_SECRET` — a long random string (not the local one if you can avoid it)
   - `GOOGLE_CLIENT_ID` — same Google OAuth client as local, or a new web client
   - `GOOGLE_BOOKS_API_KEY` — optional, improves Discover
   Railway injects `MYSQL_URL` when the database is linked. You do **not** need to copy passwords by hand if the plugin is linked to the service.
5. Set the service **Root Directory** to this folder if the GitHub repo is a parent of `backend`. If this `package.json` is at the repo root, leave Root Directory empty.
6. After the first deploy, open a Railway MySQL query window and run `sql/schema_railway.sql`. Do **not** run `schema_v2.sql` on Railway — that file drops the whole database.
7. Copy the public URL (e.g. `https://shelfspace-production.up.railway.app`) into Google OAuth:
   - **Authorized JavaScript origins**: `https://your-app.up.railway.app`
   - **Authorized redirect URIs**: same origin if Google asks for it

Visit `/api/health` on the live URL. You should see `{"status":"ok"}`.

## GitHub

Do not commit `.env`. It is gitignored.

```bash
git init -b main
git add .
git commit -m "Add ShelfSpace reading tracker"
gh repo create shelfspace --source=. --public --push
```
