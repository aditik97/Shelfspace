// db.js
// Sets up a reusable connection "pool" to MySQL.
// A pool keeps several connections open and ready, instead of opening
// a brand new connection for every single request (which is slow).

require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306, // Aiven/other hosts use a custom port; defaults to MySQL's standard port locally
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined, // Aiven requires SSL; rejectUnauthorized:false trusts the connection without pinning their private CA
});

module.exports = pool;