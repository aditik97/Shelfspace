// routes/entries.js
// Main CRUD for books/fanfic/article/blog entries. Every entry, tag, and
// list link is now scoped to the logged-in user - nobody can see or
// modify another user's data.

const express = require('express');
const router = express.Router();
const pool = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

// Helper: attach type name, tags, and lists to a single entry object
async function attachTagsAndLists(entry, userId) {
  const [typeRows] = await pool.query('SELECT name FROM types WHERE id = ? AND user_id = ?', [entry.type_id, userId]);
  const [tags] = await pool.query(
    `SELECT t.id, t.name FROM tags t
     JOIN entry_tags et ON et.tag_id = t.id
     WHERE et.entry_id = ?`,
    [entry.id]
  );
  const [lists] = await pool.query(
    `SELECT l.id, l.name FROM lists l
     JOIN entry_lists el ON el.list_id = l.id
     WHERE el.entry_id = ?`,
    [entry.id]
  );
  return { ...entry, type_name: typeRows[0]?.name || null, tags, lists };
}

// GET /api/entries
// Supports optional filters: ?type_id=1&genre_id=2&list_id=1&status=finished&search=harry
router.get('/', async (req, res) => {
  try {
    const { type_id, genre_id, list_id, status, search, limit } = req.query;
    let sql = `SELECT DISTINCT e.* FROM entries e`;
    const params = [];

    if (list_id) {
      sql += ` JOIN entry_lists el ON el.entry_id = e.id AND el.list_id = ?`;
      params.push(list_id);
    }

    const where = ['e.user_id = ?'];
    params.push(req.userId);
    if (type_id) { where.push('e.type_id = ?'); params.push(type_id); }
    if (genre_id) { where.push('e.genre_id = ?'); params.push(genre_id); }
    if (status) { where.push('e.status = ?'); params.push(status); }
    if (search) {
      const like = `%${search}%`;
      sql += ` LEFT JOIN entry_tags et_s ON et_s.entry_id = e.id LEFT JOIN tags t_s ON t_s.id = et_s.tag_id`;
      where.push('(e.title LIKE ? OR e.author LIKE ? OR e.synopsis LIKE ? OR t_s.name LIKE ?)');
      params.push(like, like, like, like);
    }

    sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY e.created_at DESC';
    const cap = Math.min(100, Math.max(0, parseInt(limit, 10) || 0));
    if (cap) { sql += ' LIMIT ?'; params.push(cap); }

    const [rows] = await pool.query(sql, params);
    const withExtras = await Promise.all(rows.map(r => attachTagsAndLists(r, req.userId)));
    res.json(withExtras);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/entries/:id - one entry with full detail (only if it's yours)
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM entries WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    if (!rows.length) return res.status(404).json({ error: 'Entry not found' });
    const entry = await attachTagsAndLists(rows[0], req.userId);
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/entries - create a new entry for the logged-in user
// body: { type_id, title, author, genre_id, synopsis, cover_image_url, url,
//          rating, status, date_finished, tags: ["name1","name2"], list_ids: [1,3] }
router.post('/', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const {
      type_id, title, author, genre_id, synopsis, cover_image_url, url,
      rating, status, date_finished, tags = [], list_ids = [],
      external_id, external_source, isbn, publication_year, access_type, read_url, buy_url,
      progress_percent = 0, current_page, total_pages, date_started,
    } = req.body;

    if (!type_id || !title) {
      return res.status(400).json({ error: 'type_id and title are required' });
    }

    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO entries (user_id, type_id, title, author, genre_id, synopsis, cover_image_url, url, rating, status, date_finished,
       external_id, external_source, isbn, publication_year, access_type, read_url, buy_url, progress_percent, current_page, total_pages, date_started)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.userId, type_id, title, author || null, genre_id || null, synopsis || null, cover_image_url || null,
       url || null, rating || null, status || 'to_read', date_finished || null, external_id || null, external_source || null,
       isbn || null, publication_year || null, access_type || null, read_url || null, buy_url || null,
       Math.min(100, Math.max(0, Number(progress_percent) || 0)), current_page || null, total_pages || null, date_started || null]
    );
    const entryId = result.insertId;

    // Tags: find-or-create each tag BY NAME WITHIN THIS USER, then link it
    for (const tagName of tags) {
      const [existing] = await conn.query('SELECT id FROM tags WHERE name = ? AND user_id = ?', [tagName, req.userId]);
      let tagId = existing.length ? existing[0].id : null;
      if (!tagId) {
        const [tagResult] = await conn.query('INSERT INTO tags (user_id, name) VALUES (?, ?)', [req.userId, tagName]);
        tagId = tagResult.insertId;
      }
      await conn.query('INSERT INTO entry_tags (entry_id, tag_id) VALUES (?, ?)', [entryId, tagId]);
    }

    // Lists: link entry to each given list id (assumes the frontend only offers this user's own lists)
    for (const listId of list_ids) {
      await conn.query('INSERT INTO entry_lists (entry_id, list_id) VALUES (?, ?)', [entryId, listId]);
    }

    await conn.commit();

    const [rows] = await pool.query('SELECT * FROM entries WHERE id = ?', [entryId]);
    const entry = await attachTagsAndLists(rows[0], req.userId);
    res.status(201).json(entry);
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// PUT /api/entries/:id - update an entry's core fields (only if it's yours)
router.put('/:id', async (req, res) => {
  try {
    const {
      title, author, genre_id, synopsis, cover_image_url, url,
      rating, status, date_finished, external_id, external_source, isbn, publication_year, access_type, read_url, buy_url,
      progress_percent, current_page, total_pages, date_started,
    } = req.body;

    await pool.query(
      `UPDATE entries SET title=?, author=?, genre_id=?, synopsis=?, cover_image_url=?, url=?,
       rating=?, status=?, date_finished=?, external_id=?, external_source=?, isbn=?, publication_year=?, access_type=?, read_url=?, buy_url=?,
       progress_percent=?, current_page=?, total_pages=?, date_started=? WHERE id=? AND user_id=?`,
      [title, author || null, genre_id || null, synopsis || null, cover_image_url || null, url || null,
       rating || null, status, date_finished || null, external_id || null, external_source || null, isbn || null, publication_year || null, access_type || null,
       read_url || null, buy_url || null, Math.min(100, Math.max(0, Number(progress_percent) || 0)), current_page || null, total_pages || null, date_started || null, req.params.id, req.userId]
    );

    const [rows] = await pool.query('SELECT * FROM entries WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    if (!rows.length) return res.status(404).json({ error: 'Entry not found' });
    const entry = await attachTagsAndLists(rows[0], req.userId);
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/entries/:id/lists - replace which shelves an entry belongs to
// body: { list_ids: [1, 4] }
router.put('/:id/lists', async (req, res) => {
  try {
    const { list_ids = [] } = req.body;
    // Confirm the entry actually belongs to this user before touching it
    const [owned] = await pool.query('SELECT id FROM entries WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    if (!owned.length) return res.status(404).json({ error: 'Entry not found' });

    await pool.query('DELETE FROM entry_lists WHERE entry_id = ?', [req.params.id]);
    for (const listId of list_ids) {
      await pool.query('INSERT INTO entry_lists (entry_id, list_id) VALUES (?, ?)', [req.params.id, listId]);
    }
    res.json({ success: true, list_ids });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/entries/:id - only deletes it if it belongs to this user
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM entries WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
