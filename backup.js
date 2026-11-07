// Backup: node backup.js  -> backups/<timestamp>/laos-remix.db (+ uploads copied with rsync/tar by deploy script)
const fs = require('fs');
const path = require('path');
const { db } = require('./db');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dir = path.join(process.env.BACKUP_DIR || path.join(__dirname, 'backups'), stamp);
fs.mkdirSync(dir, { recursive: true });
db.exec(`VACUUM INTO '${path.join(dir, 'laos-remix.db').replace(/'/g, "''")}'`);
const uploads = path.join(__dirname, 'uploads');
if (fs.existsSync(uploads)) fs.cpSync(uploads, path.join(dir, 'uploads'), { recursive: true });
const root = path.dirname(dir);
const old = fs.readdirSync(root).filter(n => /^\d{4}-/.test(n)).sort().slice(0, -Number(process.env.KEEP || 7));
for (const name of old) fs.rmSync(path.join(root, name), { recursive: true, force: true });
console.log('Backup saved:', dir, old.length ? `(removed ${old.length} old)` : '');
