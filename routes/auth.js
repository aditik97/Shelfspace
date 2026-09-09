// routes/auth.js
// Handles Google Sign-In. The frontend gets an ID token from Google and
// sends it here; we verify it's genuinely from Google, then either find
// the matching user or create a brand new one (seeding their starter
// genres/types/shelves on first login).

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const pool = require('../db');
const requireAuth = require('../middleware/auth');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const DEFAULT_TYPES = ['Book', 'Fanfic', 'Article', 'Blog'];
const DEFAULT_GENRES = ['Fantasy', 'Romance', 'Mystery', 'Sci-Fi', 'Horror', 'Drama', 'Slice of Life', 'Non-Fiction', 'Adventure', 'Historical'];
const DEFAULT_LISTS = [
  { name: 'Favorites', is_private: false },
  { name: 'All-Time Stars', is_private: false },
  { name: 'To-Read', is_private: false },
  { name: 'Currently Reading', is_private: false },
  { name: 'Secret', is_private: true },
];

// Gives a brand-new user a non-empty starting point instead of a blank app.
async function seedDefaultsForUser(userId) {
  for (const name of DEFAULT_TYPES) {
    await pool.query('INSERT IGNORE INTO types (user_id, name) VALUES (?, ?)', [userId, name]);
  }
  for (const name of DEFAULT_GENRES) {
    await pool.query('INSERT IGNORE INTO genres (user_id, name) VALUES (?, ?)', [userId, name]);
  }
  for (const list of DEFAULT_LISTS) {
    await pool.query('INSERT IGNORE INTO lists (user_id, name, is_private) VALUES (?, ?, ?)', [userId, list.name, list.is_private]);
  }
}

// POST /api/auth/google
// body: { credential } - the ID token string Google Identity Services gives the frontend
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'credential is required' });

    // Ask Google to confirm this token is real and read who it belongs to
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    const [existing] = await pool.query('SELECT * FROM users WHERE google_id = ?', [googleId]);
    let user;

    if (existing.length) {
      user = existing[0];
      // Keep the Google profile photo fresh (URLs can expire / change size params).
      if (picture && picture !== user.profile_picture) {
        await pool.query('UPDATE users SET profile_picture = ?, name = COALESCE(?, name) WHERE id = ?', [picture, name, user.id]);
        user.profile_picture = picture;
        if (name) user.name = name;
      }
    } else {
      const [result] = await pool.query(
        'INSERT INTO users (google_id, email, name, profile_picture) VALUES (?, ?, ?, ?)',
        [googleId, email, name, picture]
      );
      user = { id: result.insertId, google_id: googleId, email, name, profile_picture: picture };
      await seedDefaultsForUser(user.id);
    }

    // Issue our own session token (separate from Google's) so we don't
    // need to re-verify with Google on every single request afterward.
    const sessionToken = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.json({
      token: sessionToken,
      user: { id: user.id, email: user.email, name: user.name, profile_picture: user.profile_picture },
    });
  } catch (err) {
    res.status(401).json({ error: 'Google authentication failed: ' + err.message });
  }
});

// GET /api/auth/me - lets the frontend check "am I still logged in?" and get user info
router.get('/me', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, email, name, profile_picture FROM users WHERE id = ?', [req.userId]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
