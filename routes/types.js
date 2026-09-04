// routes/types.js
// CRUD for entry types (Book, Fanfic, Article, Blog, or anything the user adds).
// Every type belongs to exactly one user now.

const express = require('express');
const router = express.Router();
const pool = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

// GET /api/types - list this user's types
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM types WHERE user_id = ? ORDER BY name', [req.userId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/types - add a new custom type for this user
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const [result] = await pool.query('INSERT INTO types (user_id, name) VALUES (?, ?)', [req.userId, name]);
    res.status(201).json({ id: result.insertId, name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/types/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM types WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
