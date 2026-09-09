// routes/notes.js
// Notes & highlights attached to a single entry. Mounted at /api/entries/:entryId/notes
// (see server.js) so every route here already has req.params.entryId available.

const express = require('express');
const router = express.Router({ mergeParams: true });
const pool = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

// Confirms the entry belongs to the logged-in user before touching its notes.
async function ownsEntry(entryId, userId) {
  const [rows] = await pool.query('SELECT id FROM entries WHERE id = ? AND user_id = ?', [entryId, userId]);
  return rows.length > 0;
}

// GET /api/entries/:entryId/notes
router.get('/', async (req, res) => {
  try {
    if (!(await ownsEntry(req.params.entryId, req.userId))) {
      return res.status(404).json({ error: 'Entry not found' });
    }
    const [rows] = await pool.query(
      'SELECT id, content, page, created_at FROM entry_notes WHERE entry_id = ? ORDER BY page IS NULL, page ASC, created_at ASC',
      [req.params.entryId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/entries/:entryId/notes
// body: { content, page? }
router.post('/', async (req, res) => {
  try {
    if (!(await ownsEntry(req.params.entryId, req.userId))) {
      return res.status(404).json({ error: 'Entry not found' });
    }
    const { content, page } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'content is required' });

    const [result] = await pool.query(
      'INSERT INTO entry_notes (entry_id, user_id, content, page) VALUES (?, ?, ?, ?)',
      [req.params.entryId, req.userId, content.trim(), page || null]
    );
    const [rows] = await pool.query('SELECT id, content, page, created_at FROM entry_notes WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/entries/:entryId/notes/:noteId
router.delete('/:noteId', async (req, res) => {
  try {
    await pool.query('DELETE FROM entry_notes WHERE id = ? AND entry_id = ? AND user_id = ?', [
      req.params.noteId, req.params.entryId, req.userId,
    ]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
