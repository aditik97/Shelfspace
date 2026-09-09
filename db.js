// db.js
// Sets up a reusable connection "pool" to MySQL.
// A pool keeps several connections open and ready, instead of opening
// a brand new connection for every single request (which is slow).

require('dotenv').config();
const mysql = require('mysql2/promise');

// Railway's MySQL plugin injects its own variable names (MYSQL_URL, MYSQLHOST, ...)
// rather than the DB_* names used elsewhere in this project. Support both so the
// same code runs locally (.env with DB_*) and on Railway (plugin-provided vars)
// without any renaming step.
const connectionUrl = process.env.DATABASE_URL || process.env.MYSQL_URL;

const pool = connectionUrl
  ? mysql.createPool(connectionUrl + (connectionUrl.includes('?') ? '&' : '?') + 'waitForConnections=true&connectionLimit=10')
  : mysql.createPool({
      host: process.env.DB_HOST || process.env.MYSQLHOST,
      port: process.env.DB_PORT || process.env.MYSQLPORT || 3306,
      user: process.env.DB_USER || process.env.MYSQLUSER,
      password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD,
      database: process.env.DB_NAME || process.env.MYSQLDATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      // Aiven and some other hosts require SSL; rejectUnauthorized:false trusts
      // the connection without pinning their private CA. Railway's own MySQL
      // plugin does not require this - only set DB_SSL=true if your host needs it.
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    });

async function ensureSchema() {
  const statements = [
    'ALTER TABLE users ADD COLUMN reading_goal INT NULL',
    'ALTER TABLE users ADD COLUMN reading_goal_year INT NULL',
  ];
  for (const sql of statements) {
    try {
      await pool.query(sql);
    } catch (err) {
      if (!/Duplicate column name/i.test(err.message || '')) {
        console.warn('Schema check:', err.message);
      }
    }
  }
}

module.exports = pool;
module.exports.ensureSchema = ensureSchema;