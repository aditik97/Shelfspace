-- ShelfSpace database schema
-- Run this once: mysql -u root -p < schema.sql

CREATE DATABASE IF NOT EXISTS shelfspace;
USE shelfspace;

CREATE TABLE IF NOT EXISTS genres (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS tags (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS lists (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  section ENUM('type','shelf') NOT NULL DEFAULT 'shelf',
  is_private BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  author VARCHAR(255) NOT NULL,
  genre_id INT,
  synopsis TEXT,
  cover_image_url VARCHAR(500),
  url VARCHAR(500),
  rating INT CHECK (rating BETWEEN 1 AND 5),
  status ENUM('to_read','currently_reading','finished') DEFAULT 'to_read',
  date_finished DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS entry_tags (
  entry_id INT,
  tag_id INT,
  PRIMARY KEY (entry_id, tag_id),
  FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS entry_lists (
  entry_id INT,
  list_id INT,
  PRIMARY KEY (entry_id, list_id),
  FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE,
  FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
);


-- Seed some starter entry types (you can add more later via the app, e.g. Manga, Webtoon)
INSERT IGNORE INTO types (name) VALUES
  ('Book'), ('Fanfic'), ('Article'), ('Blog');

-- Seed the default lists/shelves so the app has them from day one
INSERT IGNORE INTO lists (name, is_private) VALUES
  ('Favorites', FALSE),
  ('All-Time Stars', FALSE),
  ('To-Read', FALSE),
  ('Currently Reading', FALSE),
  ('Secret', TRUE);

-- Seed a starter set of genres (you can add more later via the app)
INSERT IGNORE INTO genres (name) VALUES
  ('Fantasy'), ('Romance'), ('Mystery'), ('Sci-Fi'), ('Horror'),
  ('Drama'), ('Slice of Life'), ('Non-Fiction'), ('Adventure'), ('Historical');
