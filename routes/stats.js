// routes/stats.js
// Reading statistics: shelf totals, this-year progress, a finishing streak,
// genre/author breakdown, and a personal yearly reading goal.
// Everything here is derived from the user's own entries - no new tracking
// table is needed except the goal, which lives on the users row.

const express = require('express');
const router = express.Router();
const pool = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

// Counts the current "finishing streak": the number of consecutive days
// (most recent day first) that have at least one book marked finished.
// A gap of more than one day breaks the streak. Today or yesterday must
// have a finish for the streak to be non-zero (otherwise it's "broken").
function computeStreak(finishDates) {
  if (!finishDates.length) return 0;
  const days = new Set(finishDates.map(d => new Date(d).toISOString().slice(0, 10)));
  const todayMs = new Date(new Date().toISOString().slice(0, 10)).getTime();
  const oneDay = 86400000;

  // Streak must be anchored at today or yesterday, else it's not "current"
  let cursor;
  if (days.has(new Date(todayMs).toISOString().slice(0, 10))) cursor = todayMs;
  else if (days.has(new Date(todayMs - oneDay).toISOString().slice(0, 10))) cursor = todayMs - oneDay;
  else return 0;

  let streak = 0;
  while (days.has(new Date(cursor).toISOString().slice(0, 10))) {
    streak += 1;
    cursor -= oneDay;
  }
  return streak;
}

// GET /api/stats - full dashboard summary
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT e.id, e.status, e.rating, e.date_finished, e.total_pages, e.progress_percent,
              g.name AS genre_name, e.author
       FROM entries e
       LEFT JOIN genres g ON g.id = e.genre_id AND g.user_id = e.user_id
       WHERE e.user_id = ?`,
      [req.userId]
    );

    let userRow = {};
    try {
      const [goalRows] = await pool.query(
        'SELECT reading_goal, reading_goal_year FROM users WHERE id = ?',
        [req.userId]
      );
      userRow = goalRows[0] || {};
    } catch {
      const [goalRows] = await pool.query('SELECT reading_goal FROM users WHERE id = ?', [req.userId]);
      userRow = goalRows[0] || {};
    }

    const thisYear = new Date().getFullYear();
    const finishYear = (value) => {
      if (!value) return thisYear;
      if (typeof value === 'string') {
        const n = parseInt(value.slice(0, 4), 10);
        return Number.isFinite(n) ? n : thisYear;
      }
      const d = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(d.getTime())) return thisYear;
      return d.getFullYear();
    };
    const totals = { to_read: 0, currently_reading: 0, finished: 0 };
    let finishedThisYear = 0;
    let pagesReadThisYear = 0;
    let ratedCount = 0;
    let ratingSum = 0;
    const genreCounts = new Map();
    const finishDates = [];

    for (const e of rows) {
      totals[e.status] = (totals[e.status] || 0) + 1;
      if (e.rating) { ratedCount += 1; ratingSum += e.rating; }
      if (e.genre_name) genreCounts.set(e.genre_name, (genreCounts.get(e.genre_name) || 0) + 1);
      if (e.status === 'finished') {
        finishDates.push(e.date_finished || new Date());
        if (finishYear(e.date_finished) === thisYear) {
          finishedThisYear += 1;
          if (e.total_pages) pagesReadThisYear += e.total_pages;
        }
      }
    }

    const topGenres = [...genreCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const goal = userRow?.reading_goal || null;

    res.json({
      totals,
      total_entries: rows.length,
      average_rating: ratedCount ? Math.round((ratingSum / ratedCount) * 10) / 10 : null,
      current_streak_days: computeStreak(finishDates),
      top_genres: topGenres,
      this_year: {
        year: thisYear,
        finished: finishedThisYear,
        pages_read: pagesReadThisYear,
        goal,
        goal_year: userRow?.reading_goal_year || thisYear,
        goal_progress_percent: goal ? Math.min(100, Math.round((finishedThisYear / goal) * 100)) : null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/stats/goal - set or clear this user's yearly reading goal
// body: { goal: <int or null> }
router.put('/goal', async (req, res) => {
  try {
    const { goal } = req.body;
    const value = goal === null || goal === undefined || goal === '' ? null : Math.max(0, parseInt(goal, 10) || 0);
    const year = new Date().getFullYear();
    try {
      await pool.query(
        'UPDATE users SET reading_goal = ?, reading_goal_year = ? WHERE id = ?',
        [value, value == null ? null : year, req.userId]
      );
    } catch {
      await pool.query('UPDATE users SET reading_goal = ? WHERE id = ?', [value, req.userId]);
    }
    res.json({ goal: value, year });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
