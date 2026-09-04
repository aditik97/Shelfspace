// routes/genres.js
// CRUD for genres. Every genre belongs to exactly one user now.

const express = require('express');
const router = express.Router();
const pool = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth); // every route below requires a logged-in user

// GET /api/genres - list this user's genres
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM genres WHERE user_id = ? ORDER BY name', [req.userId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/genres - add a new genre for this user
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const [result] = await pool.query('INSERT INTO genres (user_id, name) VALUES (?, ?)', [req.userId, name]);
    res.status(201).json({ id: result.insertId, name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/genres/:id - only deletes it if it belongs to this user
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM genres WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
