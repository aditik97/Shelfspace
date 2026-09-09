// ShelfSpace discovery: public book search + availability metadata.
// Open Library is the no-key fallback; Google Books is used when a key is configured
// (and also tried without a key, which Google allows at a low quota).
const express = require('express');
const router = express.Router();

const OL_FIELDS = 'key,title,author_name,first_publish_year,cover_i,isbn,subject,ebook_access,has_fulltext,public_scan_b,ia';

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function audibleSearchUrl(title, author) {
  const q = [cleanText(title), cleanText(author)].filter(Boolean).join(' ');
  return q ? `https://www.audible.com/search?keywords=${encodeURIComponent(q)}` : null;
}

function coverFromGoogle(v) {
  const image = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail || null;
  return image ? image.replace(/^http:/, 'https:') : null;
}

function normalizeGoogle(item) {
  const v = item.volumeInfo || {};
  const sale = item.saleInfo || {};
  const access = item.accessInfo || {};
  const ids = v.industryIdentifiers || [];
  const isbn = ids.find(x => x.type === 'ISBN_13')?.identifier || ids[0]?.identifier || null;
  const publicDomain = access.publicDomain === true;
  const fullyReadable = access.viewability === 'ALL_PAGES';
  return {
    source: 'Google Books', external_id: item.id,
    title: cleanText(v.title), author: cleanText((v.authors || []).join(', ')),
    description: cleanText(v.description), year: v.publishedDate ? String(v.publishedDate).slice(0, 4) : null,
    genres: (v.categories || []).slice(0, 8), cover: coverFromGoogle(v), isbn,
    preview_url: access.webReaderLink || access.previewLink || v.infoLink || null,
    buy_url: sale.buyLink || null,
    audiobook_url: audibleSearchUrl(v.title, (v.authors || []).join(', ')),
    can_read_free: publicDomain || fullyReadable,
    access_type: publicDomain ? 'public' : (fullyReadable ? 'free' : (access.viewability && access.viewability !== 'NO_PAGES' ? 'preview' : 'none')),
    read_label: publicDomain ? 'Read free' : (fullyReadable ? 'Read' : (access.previewLink ? 'Preview' : null)),
    info_url: v.infoLink || null
  };
}

function normalizeOpenLibrary(doc) {
  const cover = doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : null;
  const ia = Array.isArray(doc.ia) ? doc.ia[0] : null;
  const ebookAccess = doc.ebook_access || null;
  const open = ebookAccess === 'public' || doc.public_scan_b === true;
  const borrowable = ebookAccess === 'borrowable';
  const readable = open || borrowable || doc.has_fulltext === true;
  return {
    source: 'Open Library', external_id: doc.key || null,
    title: cleanText(doc.title), author: cleanText((doc.author_name || []).join(', ')),
    description: '',
    year: doc.first_publish_year ? String(doc.first_publish_year) : null,
    genres: (doc.subject || []).slice(0, 8), cover,
    isbn: (doc.isbn || [])[0] || null,
    preview_url: ia ? `https://archive.org/details/${encodeURIComponent(ia)}` : (doc.key ? `https://openlibrary.org${doc.key}` : null),
    buy_url: null,
    audiobook_url: audibleSearchUrl(doc.title, (doc.author_name || []).join(', ')),
    can_read_free: open,
    access_type: open ? 'public' : (borrowable ? 'borrowable' : (readable ? 'preview' : 'none')),
    read_label: open ? 'Read free' : (borrowable ? 'Borrow' : (readable ? 'Read / access' : null)),
    info_url: doc.key ? `https://openlibrary.org${doc.key}` : null
  };
}

function fetchJson(url, ms = 10000) {
  return fetch(url, { signal: AbortSignal.timeout(ms) }).then(async (response) => {
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    return response.json();
  });
}

// "vs khandekar" → also try "v. s. khandekar", "v s khandekar", "khandekar"
function queryVariants(query) {
  const q = cleanText(query);
  const set = new Set([q]);
  const tokens = q.split(' ');
  if (tokens.length >= 2 && /^[a-z]{1,4}$/i.test(tokens[0])) {
    const initials = tokens[0];
    const rest = tokens.slice(1).join(' ');
    const letters = initials.split('');
    set.add(`${letters.join('. ')}. ${rest}`);
    set.add(`${letters.join('.')}. ${rest}`);
    set.add(`${letters.join(' ')} ${rest}`);
    set.add(rest);
  }
  return [...set];
}

async function openLibraryByParams(paramPairs) {
  const params = new URLSearchParams(paramPairs);
  params.set('limit', '24');
  params.set('fields', OL_FIELDS);
  try {
    const data = await fetchJson(`https://openlibrary.org/search.json?${params}`);
    return (data.docs || []).map(normalizeOpenLibrary).filter(b => b.title);
  } catch (err) {
    const fallback = new URLSearchParams(paramPairs);
    fallback.set('limit', '24');
    const data = await fetchJson(`https://openlibrary.org/search.json?${fallback}`);
    return (data.docs || []).map(normalizeOpenLibrary).filter(b => b.title);
  }
}

async function openLibraryAuthorKeySearch(query) {
  const data = await fetchJson(`https://openlibrary.org/search/authors.json?q=${encodeURIComponent(query)}&limit=5`);
  const keys = (data.docs || []).map(d => d.key).filter(Boolean).slice(0, 3);
  const buckets = await Promise.allSettled(
    keys.map(key => openLibraryByParams({ author_key: key.replace(/^\/authors\//, '') }))
  );
  return buckets.filter(b => b.status === 'fulfilled').flatMap(b => b.value);
}

async function openLibrarySearch(query, mode) {
  const variants = queryVariants(query);
  const dotted = variants.find(v => v.includes('.'));
  const last = query.split(/\s+/).pop();
  const jobs = [];

  if (mode === 'title') {
    jobs.push(openLibraryByParams({ title: query }));
  } else {
    jobs.push(openLibraryByParams({ q: query }));
    jobs.push(openLibraryByParams({ author: query }));
    if (dotted && dotted !== query) jobs.push(openLibraryByParams({ author: dotted }));
    jobs.push(openLibraryAuthorKeySearch(query));
    if (last && last.length > 3 && last.toLowerCase() !== query.toLowerCase()) {
      jobs.push(openLibraryAuthorKeySearch(last));
    }
  }

  const settled = await Promise.allSettled(jobs);
  return dedupe(settled.filter(s => s.status === 'fulfilled').flatMap(s => s.value));
}

async function googleBooksSearch(query, mode) {
  const key = (process.env.GOOGLE_BOOKS_API_KEY || '').trim();
  const last = query.split(/\s+/).pop();
  const queries = [];
  if (mode === 'author') {
    queries.push(`inauthor:${query}`);
    if (last && last !== query) queries.push(`inauthor:${last}`);
  } else if (mode === 'title') {
    queries.push(`intitle:${query}`);
  } else {
    queries.push(query);
    queries.push(`inauthor:${query}`);
    if (last && last.length > 3 && last !== query) queries.push(`inauthor:${last}`);
  }

  const jobs = queries.map(async (q) => {
    const params = new URLSearchParams({ q, maxResults: '20', orderBy: 'relevance' });
    if (key) params.set('key', key);
    const data = await fetchJson(`https://www.googleapis.com/books/v1/volumes?${params}`);
    return (data.items || []).map(normalizeGoogle).filter(b => b.title);
  });

  const settled = await Promise.allSettled(jobs);
  return dedupe(settled.filter(s => s.status === 'fulfilled').flatMap(s => s.value));
}

function dedupe(results) {
  const seen = new Set();
  return results.filter(book => {
    const key = `${book.title.toLowerCase()}|${book.author.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

router.get('/search', async (req, res) => {
  const q = cleanText(req.query.q);
  const mode = ['title', 'author', 'keyword'].includes(req.query.mode) ? req.query.mode : 'keyword';
  if (!q) return res.status(400).json({ error: 'Search query is required.' });
  try {
    const [google, open] = await Promise.allSettled([googleBooksSearch(q, mode), openLibrarySearch(q, mode)]);
    if (google.status === 'rejected') console.error('Google Books search failed:', google.reason);
    if (open.status === 'rejected') console.error('Open Library search failed:', open.reason);
    const results = dedupe([
      ...(google.status === 'fulfilled' ? google.value : []),
      ...(open.status === 'fulfilled' ? open.value : [])
    ]).slice(0, 36);
    res.json({
      query: q, mode, count: results.length, results,
      sources: {
        google_books: google.status === 'fulfilled',
        open_library: open.status === 'fulfilled'
      }
    });
  } catch (error) {
    console.error('Book discovery error:', error);
    res.status(502).json({ error: 'Book search is temporarily unavailable.' });
  }
});

async function openLibraryWorkDescription(externalId) {
  if (!externalId) return '';
  let path = String(externalId).startsWith('/') ? externalId : `/${externalId}`;
  if (path.startsWith('/books/')) {
    const edition = await fetchJson(`https://openlibrary.org${path}.json`);
    path = edition.works && edition.works[0] ? edition.works[0].key : path;
  }
  const work = await fetchJson(`https://openlibrary.org${path}.json`);
  const d = work.description;
  if (typeof d === 'string') return d.trim();
  if (d && typeof d.value === 'string') return d.value.trim();
  return '';
}

async function enrichBook(book) {
  if (!book) return null;
  const next = { ...book };
  if ((!next.description || !next.cover) && next.source === 'Open Library' && next.external_id) {
    try {
      if (!next.description) next.description = await openLibraryWorkDescription(next.external_id);
    } catch (_) {}
  }
  if (!next.description || !next.cover) {
    const q = [next.title, next.author].filter(Boolean).join(' ');
    try {
      const extra = await googleBooksSearch(q, 'keyword');
      const hit = extra[0];
      if (hit) {
        if (!next.description) next.description = hit.description;
        if (!next.cover) next.cover = hit.cover;
        if (!next.isbn) next.isbn = hit.isbn;
        if (!next.year) next.year = hit.year;
      }
    } catch (_) {}
  }
  return next;
}

// GET /api/discover/lookup?title=...&author=...
// Fills synopsis + cover for the add/edit form.
router.get('/lookup', async (req, res) => {
  const title = cleanText(req.query.title);
  const author = cleanText(req.query.author);
  if (!title) return res.status(400).json({ error: 'title is required' });
  try {
    const q = author ? `${title} ${author}` : title;
    const [byTitle, byKeyword, open] = await Promise.allSettled([
      googleBooksSearch(title, 'title'),
      googleBooksSearch(q, 'keyword'),
      openLibrarySearch(title, 'title')
    ]);
    const results = dedupe([
      ...(byTitle.status === 'fulfilled' ? byTitle.value : []),
      ...(byKeyword.status === 'fulfilled' ? byKeyword.value : []),
      ...(open.status === 'fulfilled' ? open.value : [])
    ]);
    if (!results.length) return res.json({ book: null });
    const book = await enrichBook(results[0]);
    res.json({ book });
  } catch (error) {
    console.error('Book lookup error:', error);
    res.status(502).json({ error: 'Could not fetch book details.' });
  }
});

module.exports = router;
