// Personalized recommendations from the user's shelf, To-Read drawer, and search history.
const express = require('express');
const router = express.Router();
const pool = require('../db');
const requireAuth = require('../middleware/auth');
router.use(requireAuth);

async function ensureHistoryTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS search_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      query VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_search_history_user (user_id, created_at)
    )
  `);
}

function fetchJson(url, ms = 8000) {
  return fetch(url, { signal: AbortSignal.timeout(ms) }).then(async (response) => {
    if (!response.ok) throw new Error(`${response.status}`);
    return response.json();
  });
}

function mapOl(docs) {
  return (docs || []).map(d => ({
    source: 'Open Library',
    external_id: d.key || null,
    title: d.title,
    author: (d.author_name || []).join(', '),
    year: d.first_publish_year ? String(d.first_publish_year) : null,
    cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
    description: '',
    genres: (d.subject || []).slice(0, 6),
    preview_url: d.key ? `https://openlibrary.org${d.key}` : null,
    info_url: d.key ? `https://openlibrary.org${d.key}` : null
  })).filter(x => x.title);
}

function mapGoogle(items) {
  return (items || []).map(item => {
    const v = item.volumeInfo || {};
    const image = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail || null;
    return {
      source: 'Google Books',
      external_id: item.id,
      title: v.title,
      author: (v.authors || []).join(', '),
      year: v.publishedDate ? String(v.publishedDate).slice(0, 4) : null,
      cover: image ? image.replace(/^http:/, 'https:') : null,
      description: v.description || '',
      genres: (v.categories || []).slice(0, 6),
      preview_url: v.previewLink || v.infoLink || null,
      info_url: v.infoLink || null
    };
  }).filter(x => x.title);
}

async function olSearch(params) {
  const url = `https://openlibrary.org/search.json?${params}&limit=16&fields=key,title,author_name,first_publish_year,cover_i,subject`;
  const data = await fetchJson(url);
  return mapOl(data.docs);
}

async function googleSearch(q) {
  const key = (process.env.GOOGLE_BOOKS_API_KEY || '').trim();
  const params = new URLSearchParams({ q, maxResults: '16', orderBy: 'relevance' });
  if (key) params.set('key', key);
  const data = await fetchJson(`https://www.googleapis.com/books/v1/volumes?${params}`);
  return mapGoogle(data.items);
}

function bookKey(book) {
  return `${(book.title || '').toLowerCase()}|${(book.author || '').toLowerCase()}`;
}

router.post('/history', async (req, res) => {
  try {
    await ensureHistoryTable();
    const query = String(req.body.query || '').replace(/\s+/g, ' ').trim().slice(0, 255);
    if (!query) return res.status(400).json({ error: 'query is required' });
    await pool.query('INSERT INTO search_history (user_id, query) VALUES (?, ?)', [req.userId, query]);
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    await ensureHistoryTable();
    const [entries] = await pool.query(
      `SELECT e.id,e.title,e.author,e.rating,e.status,e.genre_id,g.name AS genre_name
       FROM entries e LEFT JOIN genres g ON g.id=e.genre_id AND g.user_id=e.user_id
       WHERE e.user_id=? ORDER BY e.created_at DESC`, [req.userId]);

    const [historyRows] = await pool.query(
      `SELECT query FROM search_history WHERE user_id=? ORDER BY created_at DESC LIMIT 20`,
      [req.userId]
    );

    const seenQueries = new Set();
    const history = [];
    for (const row of historyRows) {
      const q = (row.query || '').trim();
      const k = q.toLowerCase();
      if (!q || seenQueries.has(k)) continue;
      seenQueries.add(k);
      history.push(q);
      if (history.length >= 6) break;
    }

    const genreScores = new Map();
    const authorScores = new Map();
    entries.forEach(e => {
      let weight = 2;
      if (e.status === 'to_read') weight = 5;
      else if (e.status === 'currently_reading') weight = 4;
      else if (e.status === 'finished') weight = e.rating ? Math.max(3, e.rating) : 3;
      if (e.rating) weight += e.rating;
      if (e.genre_name) genreScores.set(e.genre_name, (genreScores.get(e.genre_name) || 0) + weight);
      if (e.author) authorScores.set(e.author, (authorScores.get(e.author) || 0) + weight);
    });

    const topGenres = [...genreScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(x => x[0]);
    const topAuthors = [...authorScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(x => x[0]);
    const titles = entries.map(e => e.title).filter(Boolean).slice(0, 5);

    const jobs = [];
    topGenres.forEach(g => {
      jobs.push(olSearch(`subject=${encodeURIComponent(g)}`));
      jobs.push(googleSearch(`subject:${g}`));
    });
    topAuthors.forEach(a => {
      jobs.push(olSearch(`author=${encodeURIComponent(a)}`));
      jobs.push(googleSearch(`inauthor:${a}`));
    });
    history.forEach(q => {
      jobs.push(olSearch(`q=${encodeURIComponent(q)}`));
      jobs.push(googleSearch(q));
    });
    titles.forEach(t => {
      jobs.push(googleSearch(t));
      jobs.push(olSearch(`q=${encodeURIComponent(t)}`));
    });
    if (!jobs.length) {
      jobs.push(googleSearch('award winning fiction'));
      jobs.push(olSearch('q=popular%20fiction'));
      jobs.push(googleSearch('contemporary novels'));
    }

    const buckets = await Promise.allSettled(jobs);
    const existing = new Set(entries.map(e => `${(e.title || '').toLowerCase()}|${(e.author || '').toLowerCase()}`));
    const scored = new Map();

    for (const bucket of buckets) {
      if (bucket.status !== 'fulfilled') continue;
      for (const book of bucket.value) {
        const key = bookKey(book);
        if (existing.has(key)) continue;
        let score = 1;
        for (const g of book.genres || []) {
          if (topGenres.some(t => g.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(g.toLowerCase()))) score += 3;
        }
        for (const [author, value] of authorScores) {
          if ((book.author || '').toLowerCase().includes(author.toLowerCase())) score += value * 2;
        }
        if (history.some(q => (book.title || '').toLowerCase().includes(q.toLowerCase()) || (book.author || '').toLowerCase().includes(q.toLowerCase()))) {
          score += 4;
        }
        const old = scored.get(key);
        if (!old || old.score < score) scored.set(key, { ...book, score });
      }
    }

    let recommendations = [...scored.values()].sort((a, b) => b.score - a.score).slice(0, 12);

    if (!recommendations.length) {
      const fallback = await Promise.allSettled([
        googleSearch('books like bestsellers'),
        olSearch('q=fiction'),
        googleSearch('literary fiction')
      ]);
      const extra = [];
      for (const f of fallback) {
        if (f.status === 'fulfilled') extra.push(...f.value);
      }
      recommendations = extra.filter(b => !existing.has(bookKey(b))).slice(0, 12);
    }

    const bits = [];
    if (topGenres.length) bits.push(`genres like ${topGenres.join(', ')}`);
    if (topAuthors.length) bits.push('authors on your shelf and To-Read list');
    if (history.length) bits.push('your recent searches');
    const reason = recommendations.length
      ? (bits.length ? `Based on ${bits.join(', ')}.` : 'Picked from catalogs to get you started.')
      : 'We could not reach the book catalogs just now. Try Discover search, then come back here.';

    res.json({
      recommendations,
      based_on: { genres: topGenres, authors: topAuthors, searches: history, entries: entries.length, to_read: entries.filter(e => e.status === 'to_read').length },
      reason
    });
  } catch (err) {
    console.error('Recommendation error:', err);
    res.status(502).json({ error: 'Recommendations are temporarily unavailable.' });
  }
});

module.exports = router;
