-- ShelfSpace database schema (v2 - multi-user)
-- Run this once: mysql -u root -p < schema.sql
-- WARNING: this drops and recreates all tables. Only run this if you're OK
-- losing existing test data (safe right now since no real entries exist yet).

DROP DATABASE IF EXISTS shelfspace;
CREATE DATABASE shelfspace;
USE shelfspace;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  google_id VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255),
  profile_picture VARCHAR(500),
  reading_goal INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(50) NOT NULL,
  UNIQUE KEY unique_type_per_user (user_id, name),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE genres (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(50) NOT NULL,
  UNIQUE KEY unique_genre_per_user (user_id, name),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE tags (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(50) NOT NULL,
  UNIQUE KEY unique_tag_per_user (user_id, name),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE lists (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(50) NOT NULL,
  is_private BOOLEAN DEFAULT FALSE,
  UNIQUE KEY unique_list_per_user (user_id, name),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  author VARCHAR(255),
  genre_id INT,
  synopsis TEXT,
  cover_image_url VARCHAR(500),
  url VARCHAR(500),
  rating INT CHECK (rating BETWEEN 1 AND 5),
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
);

CREATE TABLE entry_tags (
  entry_id INT,
  tag_id INT,
  PRIMARY KEY (entry_id, tag_id),
  FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE entry_lists (
  entry_id INT,
  list_id INT,
  PRIMARY KEY (entry_id, list_id),
  FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE,
  FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
);

CREATE TABLE entry_notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  entry_id INT NOT NULL,
  user_id INT NOT NULL,
  content TEXT NOT NULL,
  page INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_entry_notes_entry ON entry_notes (entry_id);
CREATE INDEX idx_entries_external ON entries (user_id, external_source, external_id);
CREATE INDEX idx_entries_status ON entries (user_id, status);

CREATE TABLE search_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  query VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_search_history_user (user_id, created_at)
);

-- Note: default genres/types/lists are no longer seeded here.
-- Instead, the backend will auto-create a starter set (Book, Fanfic, Article, Blog,
-- Favorites, To-Read, Currently Reading, Secret, and a few starter genres)
-- the first time each new user logs in. See routes/auth.js.
