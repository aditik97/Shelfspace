// routes/lists.js
// CRUD for shelves/lists (Favorites, To-Read, Secret, etc.)
// Every list belongs to exactly one user now.

const express = require('express');
const router = express.Router();
const pool = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

// GET /api/lists - this user's shelves
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM lists WHERE user_id = ? ORDER BY id', [req.userId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/lists - create a custom shelf for this user
router.post('/', async (req, res) => {
  try {
    const { name, is_private } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const [result] = await pool.query(
      'INSERT INTO lists (user_id, name, is_private) VALUES (?, ?, ?)',
      [req.userId, name, !!is_private]
    );
    res.status(201).json({ id: result.insertId, name, is_private: !!is_private });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/lists/:id
// Deleting a shelf does NOT delete its entries - it just un-assigns them from this shelf
// (entry_lists has ON DELETE CASCADE on list_id, so those link rows are cleaned up automatically).
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM lists WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;