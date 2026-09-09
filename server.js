// server.js
// Entry point for the backend. Wires up Express, middleware, and all routes.

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const pool = require('./db');
const authRoutes = require('./routes/auth');
const entriesRoutes = require('./routes/entries');
const genresRoutes = require('./routes/genres');
const typesRoutes = require('./routes/types');
const listsRoutes = require('./routes/lists');
const discoverRoutes = require('./routes/discover');
const recommendationsRoutes = require('./routes/recommendations');
const statsRoutes = require('./routes/stats');
const notesRoutes = require('./routes/notes');

const app = express();

app.use(cors());          // allows the frontend (different port) to call this API
app.use(express.json());  // parses incoming JSON request bodies into req.body
app.use(express.static('public')); // serves the frontend (public/index.html etc.) at localhost:5000

// Health check - visit http://localhost:5000/api/health to confirm the server is alive
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Public, non-secret config the frontend needs before login (the Google OAuth
// Client ID is meant to be public - it identifies the app, not a credential).
app.get('/api/config', (req, res) => {
  res.json({ googleClientId: (process.env.GOOGLE_CLIENT_ID || '').trim() });
});

// Auth routes are NOT behind requireAuth (you need to be able to log in
// before you're logged in). Every other route below checks auth internally.
app.use('/api/auth', authRoutes);
app.use('/api/discover', discoverRoutes);
app.use('/api/recommendations', recommendationsRoutes);
app.use('/api/stats', statsRoutes);

app.use('/api/entries', entriesRoutes);
app.use('/api/entries/:entryId/notes', notesRoutes); // nested under entries, keeps notes scoped to one book
app.use('/api/genres', genresRoutes);
app.use('/api/types', typesRoutes);
app.use('/api/lists', listsRoutes);

const PORT = process.env.PORT || 5000;
pool.ensureSchema().then(() => {
  app.listen(PORT, () => {
    console.log(`ShelfSpace API running on http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error('Could not check database schema:', err.message);
  app.listen(PORT, () => {
    console.log(`ShelfSpace API running on http://localhost:${PORT}`);
  });
});
