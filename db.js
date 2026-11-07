// SQLite database layer for LAOS REMIX (uses Node's built-in node:sqlite, Node 22+).
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = process.env.DB_FILE || path.join(DATA_DIR, 'laos-remix.db');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS tracks (
  id            TEXT PRIMARY KEY,
  position      INTEGER NOT NULL DEFAULT 0,
  title         TEXT NOT NULL,
  artist        TEXT NOT NULL DEFAULT '',
  collection    TEXT NOT NULL DEFAULT 'remix' CHECK (collection IN ('remix','credit','folder')),
  genre         TEXT NOT NULL DEFAULT 'other' CHECK (genre IN ('lao','other')),
  duration      TEXT NOT NULL DEFAULT '—:—',
  downloads     INTEGER NOT NULL DEFAULT 0,
  file_url      TEXT,
  file_name     TEXT,
  cover_url     TEXT,
  cover_checked INTEGER NOT NULL DEFAULT 0,
  folder_id     TEXT,
  folder_name   TEXT,
  highlight     INTEGER NOT NULL DEFAULT 0,
  uploaded_at   INTEGER,
  extra         TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_tracks_position   ON tracks(position);
CREATE INDEX IF NOT EXISTS idx_tracks_folder     ON tracks(folder_id);
CREATE INDEX IF NOT EXISTS idx_tracks_collection ON tracks(collection);

CREATE TABLE IF NOT EXISTS members (            -- คนรับทำเพลง
  id          TEXT PRIMARY KEY,
  position    INTEGER NOT NULL DEFAULT 0,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  facebook    TEXT NOT NULL DEFAULT '',
  tiktok      TEXT NOT NULL DEFAULT '',
  instagram   TEXT NOT NULL DEFAULT '',
  whatsapp    TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS group_members (      -- สมาชิกกลุ่ม
  id         TEXT PRIMARY KEY,
  position   INTEGER NOT NULL DEFAULT 0,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS visitors (           -- ผู้เข้าชม (เก็บเฉพาะค่า hash)
  hash       TEXT PRIMARY KEY,
  first_seen INTEGER NOT NULL
);
`);

const KNOWN_TRACK_KEYS = new Set(['id', 'title', 'artist', 'collection', 'genre', 'duration', 'downloads', 'fileUrl', 'fileName', 'coverUrl', 'coverChecked', 'folderId', 'folderName', 'highlight', 'uploadedAt']);

function trackFromRow(row) {
  const track = { id: row.id, title: row.title, artist: row.artist, collection: row.collection, genre: row.genre, duration: row.duration, downloads: row.downloads };
  if (row.file_url) track.fileUrl = row.file_url;
  if (row.file_name) track.fileName = row.file_name;
  if (row.cover_url) track.coverUrl = row.cover_url;
  if (row.cover_checked) track.coverChecked = true;
  if (row.folder_id) { track.folderId = row.folder_id; track.folderName = row.folder_name || ''; }
  if (row.highlight) track.highlight = true;
  if (row.uploaded_at) track.uploadedAt = row.uploaded_at;
  try { Object.assign(track, JSON.parse(row.extra || '{}')); } catch {}
  return track;
}

const trackParams = (track, position) => {
  const extra = {};
  for (const [key, value] of Object.entries(track)) if (!KNOWN_TRACK_KEYS.has(key)) extra[key] = value;
  return [
    String(track.id), position, String(track.title || ''), String(track.artist || ''),
    ['remix', 'credit', 'folder'].includes(track.collection) ? track.collection : 'remix',
    ['lao', 'other'].includes(track.genre) ? track.genre : 'other',
    String(track.duration || '—:—'), Number(track.downloads) || 0,
    track.fileUrl || null, track.fileName || null, track.coverUrl || null, track.coverChecked ? 1 : 0,
    track.folderId || null, track.folderName || null, track.highlight ? 1 : 0,
    Number(track.uploadedAt) || null, JSON.stringify(extra)
  ];
};

const upsertTrackSql = `INSERT INTO tracks (id, position, title, artist, collection, genre, duration, downloads, file_url, file_name, cover_url, cover_checked, folder_id, folder_name, highlight, uploaded_at, extra)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET position=excluded.position, title=excluded.title, artist=excluded.artist, collection=excluded.collection, genre=excluded.genre, duration=excluded.duration, downloads=excluded.downloads, file_url=excluded.file_url, file_name=excluded.file_name, cover_url=excluded.cover_url, cover_checked=excluded.cover_checked, folder_id=excluded.folder_id, folder_name=excluded.folder_name, highlight=excluded.highlight, uploaded_at=excluded.uploaded_at, extra=excluded.extra`;

function transaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
}

// ---- tracks (same shape the API returned from tracks.json; newest first) ----
function readTracks() { return db.prepare('SELECT * FROM tracks ORDER BY position ASC, rowid ASC').all().map(trackFromRow); }
function saveTracks(tracks) {
  transaction(() => {
    const upsert = db.prepare(upsertTrackSql);
    tracks.forEach((track, index) => upsert.run(...trackParams(track, index)));
    const keep = new Set(tracks.map(track => String(track.id)));
    const del = db.prepare('DELETE FROM tracks WHERE id = ?');
    for (const { id } of db.prepare('SELECT id FROM tracks').all()) if (!keep.has(id)) del.run(id);
  });
}
function addTrack(track) {
  transaction(() => {
    db.exec('UPDATE tracks SET position = position + 1');
    db.prepare(upsertTrackSql).run(...trackParams(track, 0));
  });
}
function incrementDownloads(ids) {
  const update = db.prepare('UPDATE tracks SET downloads = downloads + 1 WHERE id = ?');
  transaction(() => { for (const id of ids) update.run(String(id)); });
}

// ---- members / group members ----
const memberFromRow = row => ({ id: row.id, name: row.name, description: row.description, facebook: row.facebook, tiktok: row.tiktok, instagram: row.instagram, whatsapp: row.whatsapp, createdAt: row.created_at });
function readMembers() { return db.prepare('SELECT * FROM members ORDER BY position ASC, rowid ASC').all().map(memberFromRow); }
function addMember(member) {
  const next = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS n FROM members').get().n;
  db.prepare('INSERT INTO members (id, position, name, description, facebook, tiktok, instagram, whatsapp, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(member.id, next, member.name, member.description || '', member.facebook || '', member.tiktok || '', member.instagram || '', member.whatsapp || '', member.createdAt || Date.now());
}
function updateMember(id, fields) {
  const result = db.prepare('UPDATE members SET description=?, facebook=?, tiktok=?, instagram=?, whatsapp=? WHERE id=?')
    .run(fields.description || '', fields.facebook || '', fields.tiktok || '', fields.instagram || '', fields.whatsapp || '', id);
  if (!result.changes) return null;
  return memberFromRow(db.prepare('SELECT * FROM members WHERE id = ?').get(id));
}
function deleteMember(id) { return db.prepare('DELETE FROM members WHERE id = ?').run(id).changes > 0; }

function readGroupMembers() { return db.prepare('SELECT id, name, created_at FROM group_members ORDER BY position ASC, rowid ASC').all().map(row => ({ id: row.id, name: row.name, createdAt: row.created_at })); }
function addGroupMember(member) {
  const next = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS n FROM group_members').get().n;
  db.prepare('INSERT INTO group_members (id, position, name, created_at) VALUES (?,?,?,?)').run(member.id, next, member.name, member.createdAt || Date.now());
}
function deleteGroupMember(id) { return db.prepare('DELETE FROM group_members WHERE id = ?').run(id).changes > 0; }

// ---- visitors ----
function registerVisitor(hash) {
  db.prepare('INSERT OR IGNORE INTO visitors (hash, first_seen) VALUES (?, ?)').run(hash, Date.now());
  return db.prepare('SELECT COUNT(*) AS n FROM visitors').get().n;
}

// ---- one-time import from the old JSON files ----
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')); } catch { return fallback; } }
function migrateFromJson() {
  const count = table => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  const summary = {};
  if (!count('tracks')) { const tracks = readJson('tracks.json', []); if (Array.isArray(tracks) && tracks.length) { saveTracks(tracks.filter(track => track && track.id)); summary.tracks = tracks.length; } }
  if (!count('members')) { const members = readJson('members.json', []); if (Array.isArray(members) && members.length) { members.forEach(member => member && member.id && addMember(member)); summary.members = members.length; } }
  if (!count('group_members')) { const members = readJson('group-members.json', []); if (Array.isArray(members) && members.length) { members.forEach(member => member && member.id && addGroupMember(member)); summary.groupMembers = members.length; } }
  if (!count('visitors')) { const data = readJson('visitors.json', {}); const hashes = Array.isArray(data.visitorHashes) ? data.visitorHashes : []; if (hashes.length) { transaction(() => hashes.forEach(hash => registerVisitor(String(hash)))); summary.visitors = hashes.length; } }
  if (Object.keys(summary).length) console.log('Imported JSON data into SQLite:', summary);
}
migrateFromJson();

module.exports = { db, DB_PATH, readTracks, saveTracks, addTrack, incrementDownloads, readMembers, addMember, updateMember, deleteMember, readGroupMembers, addGroupMember, deleteGroupMember, registerVisitor };
