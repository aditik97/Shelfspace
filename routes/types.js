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
// Entries that still use this type are moved onto another type the user owns
// so a leftover type like "Shelf" can be removed from the left rail.
router.delete('/:id', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const typeId = Number(req.params.id);
    const [owned] = await conn.query('SELECT id FROM types WHERE id = ? AND user_id = ?', [typeId, req.userId]);
    if (!owned.length) {
      conn.release();
      return res.status(404).json({ error: 'Type not found' });
    }

    const [others] = await conn.query(
      'SELECT id FROM types WHERE user_id = ? AND id != ? ORDER BY name LIMIT 1',
      [req.userId, typeId]
    );
    const [[{ cnt }]] = await conn.query(
      'SELECT COUNT(*) AS cnt FROM entries WHERE type_id = ? AND user_id = ?',
      [typeId, req.userId]
    );

    if (cnt > 0 && !others.length) {
      conn.release();
      return res.status(400).json({ error: 'Add another content type first, then you can delete this one.' });
    }

    await conn.beginTransaction();
    if (cnt > 0) {
      await conn.query(
        'UPDATE entries SET type_id = ? WHERE type_id = ? AND user_id = ?',
        [others[0].id, typeId, req.userId]
      );
    }
    await conn.query('DELETE FROM types WHERE id = ? AND user_id = ?', [typeId, req.userId]);
    await conn.commit();
    res.status(204).send();
  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;