// db.js
// Sets up a reusable connection "pool" to MySQL.
// A pool keeps several connections open and ready, instead of opening
// a brand new connection for every single request (which is slow).

require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = pool;
