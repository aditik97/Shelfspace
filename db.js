// db.js
// Sets up a reusable connection "pool" to MySQL.
// A pool keeps several connections open and ready, instead of opening
// a brand new connection for every single request (which is slow).

require('dotenv').config();
const mysql = require('mysql2/promise');

function env(name) {
  const v = process.env[name];
  return v == null ? '' : String(v).trim();
}

function poolConfigFromUrl(raw) {
  const u = new URL(raw);
  const host = decodeURIComponent(u.hostname);
  return {
    host,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.replace(/^\//, '').split('?')[0] || 'railway'),
    waitForConnections: true,
    connectionLimit: 10,
    enableKeepAlive: true,
    // Railway private DNS is IPv6; Node's dual-stack lookup often becomes AggregateError.
    family: host.endsWith('.railway.internal') ? 6 : 0,
  };
}

// Prefer a URL. Public URL is IPv4 and more reliable from Node; internal is fine with family 6.
const connectionUrl = env('MYSQL_PUBLIC_URL') || env('DATABASE_URL') || env('MYSQL_URL');

const pool = connectionUrl
  ? mysql.createPool(poolConfigFromUrl(connectionUrl))
  : mysql.createPool({
      host: env('MYSQLHOST') || env('DB_HOST') || 'localhost',
      port: Number(env('MYSQLPORT') || env('DB_PORT') || 3306),
      user: env('MYSQLUSER') || env('DB_USER'),
      password: env('MYSQLPASSWORD') || env('DB_PASSWORD'),
      database: env('MYSQLDATABASE') || env('DB_NAME'),
      waitForConnections: true,
      connectionLimit: 10,
      enableKeepAlive: true,
      family: (env('MYSQLHOST') || env('DB_HOST')).endsWith('.railway.internal') ? 6 : 0,
      ssl: env('DB_SSL') === 'true' ? { rejectUnauthorized: false } : undefined,
    });

const TABLE_SQL = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    google_id VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255),
    profile_picture VARCHAR(500),
    reading_goal INT NULL,
    reading_goal_year INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(50) NOT NULL,
    UNIQUE KEY unique_type_per_user (user_id, name),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS genres (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(50) NOT NULL,
    UNIQUE KEY unique_genre_per_user (user_id, name),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS tags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(50) NOT NULL,
    UNIQUE KEY unique_tag_per_user (user_id, name),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS lists (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(50) NOT NULL,
    is_private BOOLEAN DEFAULT FALSE,
    UNIQUE KEY unique_list_per_user (user_id, name),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS entries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    type_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    author VARCHAR(255),
    genre_id INT,
    synopsis TEXT,
    cover_image_url VARCHAR(500),
    url VARCHAR(500),
    rating INT,
    status ENUM('to_read','currently_reading','finished') DEFAULT 'to_read',
    date_finished DATE,
    external_id VARCHAR(255),
    external_source VARCHAR(50),
    isbn VARCHAR(32),
    publication_year INT,
    access_type VARCHAR(30),
    read_url VARCHAR(500),
    buy_url VARCHAR(500),
    progress_percent INT NOT NULL DEFAULT 0,
    current_page INT,
    total_pages INT,
    date_started DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (type_id) REFERENCES types(id),
    FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS entry_tags (
    entry_id INT,
    tag_id INT,
    PRIMARY KEY (entry_id, tag_id),
    FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS entry_lists (
    entry_id INT,
    list_id INT,
    PRIMARY KEY (entry_id, list_id),
    FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE,
    FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS entry_notes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    entry_id INT NOT NULL,
    user_id INT NOT NULL,
    content TEXT NOT NULL,
    page INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
];

async function ensureSchema() {
  for (const sql of TABLE_SQL) {
    await pool.query(sql);
  }
  const alters = [
    'ALTER TABLE users ADD COLUMN reading_goal INT NULL',
    'ALTER TABLE users ADD COLUMN reading_goal_year INT NULL',
  ];
  for (const sql of alters) {
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
