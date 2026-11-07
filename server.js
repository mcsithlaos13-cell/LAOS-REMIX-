const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'tracks.json');
const VISITORS_FILE = path.join(DATA_DIR, 'visitors.json');
const MEMBERS_FILE = path.join(DATA_DIR, 'members.json');
const GROUP_MEMBERS_FILE = path.join(DATA_DIR, 'group-members.json');
const PORT = Number(process.env.PORT || 3000);
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const allowedExtensions = new Set(['.mp3', '.wav', '.m4a', '.ogg', '.opus', '.aac', '.flac']);
const onlineVisitors = new Map();
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]\n', 'utf8');
if (!fs.existsSync(VISITORS_FILE)) fs.writeFileSync(VISITORS_FILE, '{"total":0,"visitorHashes":[]}\n', 'utf8');
if (!fs.existsSync(MEMBERS_FILE)) fs.writeFileSync(MEMBERS_FILE, '[]\n', 'utf8');
if (!fs.existsSync(GROUP_MEMBERS_FILE)) fs.writeFileSync(GROUP_MEMBERS_FILE, '[]\n', 'utf8');

function readTracks() {
  try { const tracks = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); return Array.isArray(tracks) ? tracks : []; }
  catch { return []; }
}
function saveTracks(tracks) { fs.writeFileSync(DB_FILE, `${JSON.stringify(tracks, null, 2)}\n`, 'utf8'); }
function readMembers() { try { const members = JSON.parse(fs.readFileSync(MEMBERS_FILE, 'utf8')); return Array.isArray(members) ? members : []; } catch { return []; } }
function saveMembers(members) { fs.writeFileSync(MEMBERS_FILE, `${JSON.stringify(members, null, 2)}\n`, 'utf8'); }
function readGroupMembers() { try { const members = JSON.parse(fs.readFileSync(GROUP_MEMBERS_FILE, 'utf8')); return Array.isArray(members) ? members : []; } catch { return []; } }
function saveGroupMembers(members) { fs.writeFileSync(GROUP_MEMBERS_FILE, `${JSON.stringify(members, null, 2)}\n`, 'utf8'); }
function readVisitorData() {
  try { const data = JSON.parse(fs.readFileSync(VISITORS_FILE, 'utf8')); return { total: Number(data.total) || 0, visitorHashes: Array.isArray(data.visitorHashes) ? data.visitorHashes : [] }; }
  catch { return { total: 0, visitorHashes: [] }; }
}
function getCookie(req, name) {
  const pair = (req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : '';
}
function send(res, status, data, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
}
function safeText(value, max) { return String(value || '').trim().slice(0, max); }
function cleanMemberSocial(value, max = 240) {
  const text = safeText(value, max);
  if (!text) return '';
  if (/^\+?[\d\s()-]{7,24}$/.test(text)) return `https://wa.me/${text.replace(/\D/g, '')}`;
  try { const url = new URL(text); return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : ''; } catch { return ''; }
}
function makeCover(bytes, declaredType = '') {
  if (!bytes || bytes.length < 16 || bytes.length > 8 * 1024 * 1024) return null;
  let mime = declaredType.toLowerCase().split(';')[0];
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) mime = 'image/png';
  else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) mime = 'image/jpeg';
  else if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') mime = 'image/webp';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) return null;
  return { mime, bytes: Buffer.from(bytes) };
}
function readFlacPicture(block) {
  try {
    let p = 0;
    const readText = () => { const n = block.readUInt32BE(p); p += 4; const value = block.subarray(p, p + n).toString('utf8'); p += n; return value; };
    p += 4; const mime = readText(); readText();
    p += 16;
    const n = block.readUInt32BE(p); p += 4;
    return makeCover(block.subarray(p, p + n), mime);
  } catch { return null; }
}
function readId3Picture(buffer) {
  let tagAt = buffer.indexOf(Buffer.from('ID3'));
  while (tagAt >= 0 && tagAt + 10 <= buffer.length) {
    const version = buffer[tagAt + 3];
    const tagSize = ((buffer[tagAt + 6] & 0x7f) << 21) | ((buffer[tagAt + 7] & 0x7f) << 14) | ((buffer[tagAt + 8] & 0x7f) << 7) | (buffer[tagAt + 9] & 0x7f);
    let p = tagAt + 10, end = Math.min(buffer.length, p + tagSize);
    while (p + (version === 2 ? 6 : 10) <= end) {
      const idLength = version === 2 ? 3 : 4;
      const frameId = buffer.subarray(p, p + idLength).toString('ascii');
      if (!/^[A-Z0-9]{3,4}$/.test(frameId)) break;
      const frameSize = version === 2 ? buffer.readUIntBE(p + 3, 3) : version === 4 ? (((buffer[p+4]&0x7f)<<21)|((buffer[p+5]&0x7f)<<14)|((buffer[p+6]&0x7f)<<7)|(buffer[p+7]&0x7f)) : buffer.readUInt32BE(p + 4);
      const header = version === 2 ? 6 : 10, dataStart = p + header, dataEnd = dataStart + frameSize;
      if (frameSize <= 0 || dataEnd > end) break;
      if (frameId === 'APIC' || frameId === 'PIC') {
        const frame = buffer.subarray(dataStart, dataEnd); let q = 1, mime = '';
        if (frameId === 'PIC') { mime = frame.subarray(q, q + 3).toString('ascii').toLowerCase() === 'png' ? 'image/png' : 'image/jpeg'; q += 3; }
        else { const zero = frame.indexOf(0, q); if (zero < 0) return null; mime = frame.subarray(q, zero).toString('ascii'); q = zero + 1; }
        q++;
        const encoding = frame[0];
        if (encoding === 1 || encoding === 2) { while (q + 1 < frame.length && !(frame[q] === 0 && frame[q+1] === 0)) q += 2; q += 2; }
        else { const zero = frame.indexOf(0, q); if (zero < 0) return null; q = zero + 1; }
        const cover = makeCover(frame.subarray(q), mime);
        if (cover) return cover;
      }
      p = dataEnd;
    }
    tagAt = buffer.indexOf(Buffer.from('ID3'), tagAt + 3);
  }
  return null;
}
function findMp4Cover(buffer, start = 0, end = buffer.length, depth = 0, inCover = false) {
  if (depth > 12) return null;
  let p = start;
  while (p + 8 <= end) {
    let size = buffer.readUInt32BE(p); const type = buffer.subarray(p + 4, p + 8).toString('ascii'); let header = 8;
    if (size === 1) { if (p + 16 > end) break; const large = buffer.readBigUInt64BE(p + 8); if (large > BigInt(Number.MAX_SAFE_INTEGER)) break; size = Number(large); header = 16; }
    else if (size === 0) size = end - p;
    if (size < header || p + size > end) break;
    const atomEnd = p + size;
    if (type === 'data' && inCover && size >= 16) {
      const typeCode = buffer.readUInt32BE(p + 8);
      const mime = typeCode === 14 ? 'image/png' : typeCode === 13 ? 'image/jpeg' : '';
      const cover = makeCover(buffer.subarray(p + 16, atomEnd), mime);
      if (cover) return cover;
    }
    const containers = new Set(['moov','udta','meta','ilst','trak','mdia','minf','stbl','edts','dinf','mvex','moof']);
    if (type === 'covr' || containers.has(type)) {
      const childStart = p + header + (type === 'meta' ? 4 : 0);
      const cover = findMp4Cover(buffer, childStart, atomEnd, depth + 1, inCover || type === 'covr');
      if (cover) return cover;
    }
    p = atomEnd;
  }
  return null;
}
function extractEmbeddedCover(buffer, ext) {
  const id3 = readId3Picture(buffer);
  if (id3) return id3;
  if (ext === '.flac' && buffer.subarray(0, 4).toString('ascii') === 'fLaC') {
    let p = 4;
    while (p + 4 <= buffer.length) {
      const header = buffer[p], type = header & 0x7f, size = buffer.readUIntBE(p + 1, 3); p += 4;
      if (p + size > buffer.length) break;
      if (type === 6) { const cover = readFlacPicture(buffer.subarray(p, p + size)); if (cover) return cover; }
      p += size; if (header & 0x80) break;
    }
  }
  if (ext === '.ogg' || ext === '.opus') {
    const text = buffer.toString('latin1');
    const match = text.match(/METADATA_BLOCK_PICTURE=([A-Za-z0-9+/=]+)/i);
    if (match) { try { const cover = readFlacPicture(Buffer.from(match[1], 'base64')); if (cover) return cover; } catch {} }
  }
  if (ext === '.m4a' || ext === '.mp4' || ext === '.aac') return findMp4Cover(buffer);
  return null;
}
function parseMultipart(buffer, boundary) {
  const fields = {};
  let file = null;
  const marker = Buffer.from(`--${boundary}`);
  let cursor = buffer.indexOf(marker);
  while (cursor !== -1) {
    cursor += marker.length;
    if (buffer.subarray(cursor, cursor + 2).toString() === '--') break;
    if (buffer.subarray(cursor, cursor + 2).toString() === '\r\n') cursor += 2;
    const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), cursor);
    if (headerEnd === -1) break;
    const header = buffer.subarray(cursor, headerEnd).toString('utf8');
    const next = buffer.indexOf(marker, headerEnd + 4);
    if (next === -1) break;
    let end = next;
    if (buffer.subarray(end - 2, end).toString() === '\r\n') end -= 2;
    const disposition = header.match(/content-disposition:\s*form-data;([^\r\n]+)/i)?.[1] || '';
    const name = disposition.match(/name="([^"]*)"/)?.[1];
    const filename = disposition.match(/filename="([^"]*)"/)?.[1];
    const content = buffer.subarray(headerEnd + 4, end);
    if (name && filename !== undefined && filename) file = { originalName: filename, content };
    else if (name) fields[name] = content.toString('utf8');
    cursor = next;
  }
  return { fields, file };
}
function receiveBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0, tooLarge = false;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_FILE_SIZE + 1024 * 1024) { tooLarge = true; chunks.length = 0; }
      else if (!tooLarge) chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) { const error = new Error('ไฟล์มีขนาดเกิน 50 MB'); error.statusCode = 413; reject(error); }
      else resolve(Buffer.concat(chunks));
    });
    req.on('error', reject);
  });
}
const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let current = value;
  for (let bit = 0; bit < 8; bit++) current = (current >>> 1) ^ (current & 1 ? 0xedb88320 : 0);
  return current >>> 0;
});
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}
function createZip(entries) {
  const zlib = require('zlib');
  const localParts = [], centralParts = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const compressed = zlib.deflateRawSync(entry.bytes);
    const crc = crc32(entry.bytes);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(entry.bytes.length, 22); local.writeUInt16LE(name.length, 26); name.copy(local, 30);
    localParts.push(local, compressed);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosTime, 12); central.writeUInt16LE(dosDate, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(entry.bytes.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42); name.copy(central, 46);
    centralParts.push(central);
    offset += local.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}
const mimeTypes = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.mp3':'audio/mpeg', '.wav':'audio/wav', '.m4a':'audio/mp4', '.ogg':'audio/ogg', '.opus':'audio/ogg', '.aac':'audio/aac', '.flac':'audio/flac', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.webp':'image/webp' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/visit' && req.method === 'GET') {
    let visitorId = getCookie(req, 'laos_remix_visitor');
    const headers = { 'Cache-Control': 'no-store' };
    if (!/^[a-f0-9-]{36}$/i.test(visitorId)) {
      visitorId = require('crypto').randomUUID();
      const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
      headers['Set-Cookie'] = `laos_remix_visitor=${visitorId}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`;
    }
    const visitorHash = require('crypto').createHash('sha256').update(visitorId).digest('hex');
    const visitors = readVisitorData();
    if (!visitors.visitorHashes.includes(visitorHash)) {
      visitors.visitorHashes.push(visitorHash);
      visitors.total = visitors.visitorHashes.length;
      fs.writeFileSync(VISITORS_FILE, `${JSON.stringify(visitors)}\n`, 'utf8');
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    return res.end(JSON.stringify({ visitors: visitors.total }));
  }
  if (url.pathname === '/api/presence' && req.method === 'GET') {
    let visitorId = getCookie(req, 'laos_remix_visitor');
    const headers = { 'Cache-Control': 'no-store' };
    if (!/^[a-f0-9-]{36}$/i.test(visitorId)) {
      visitorId = require('crypto').randomUUID();
      const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
      headers['Set-Cookie'] = `laos_remix_visitor=${visitorId}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`;
    }
    const visitorHash = require('crypto').createHash('sha256').update(visitorId).digest('hex');
    const now = Date.now();
    onlineVisitors.set(visitorHash, now);
    for (const [id, lastSeen] of onlineVisitors) if (now - lastSeen > 45_000) onlineVisitors.delete(id);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
    return res.end(JSON.stringify({ online: onlineVisitors.size }));
  }
  if (url.pathname === '/api/version' && req.method === 'GET') {
    const files = ['index.html', 'app.js', 'style.css', 'upload.html', 'upload-page.js', 'producers.html', 'producers.js', 'group-members.html', 'group-members.js'];
    const version = files.map(file => { try { const stat = fs.statSync(path.join(ROOT, file)); return `${stat.mtimeMs}-${stat.size}`; } catch { return 'missing'; } }).join('|');
    return send(res, 200, { version }, 'application/json; charset=utf-8');
  }
  if (url.pathname === '/api/members' && req.method === 'GET') return send(res, 200, readMembers());
  if (url.pathname === '/api/group-members' && req.method === 'GET') return send(res, 200, readGroupMembers());
  if (url.pathname === '/api/group-members' && req.method === 'POST') {
    const address = req.socket.remoteAddress || '';
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address) || req.headers['cf-connecting-ip']) return send(res, 403, { error: 'จัดการรายชื่อได้จากเครื่องเจ้าของเว็บเท่านั้น' });
    try {
      const body = await receiveBody(req); if (body.length > 8 * 1024) return send(res, 413, { error: 'ข้อมูลใหญ่เกินกำหนด' });
      const name = safeText(JSON.parse(body.toString('utf8')).name, 60); if (!name) return send(res, 400, { error: 'กรุณากรอกชื่อสมาชิก' });
      const member = { id: require('crypto').randomUUID(), name, createdAt: Date.now() }, members = readGroupMembers(); members.push(member); saveGroupMembers(members);
      return send(res, 201, { member });
    } catch (error) { return send(res, 400, { error: error.message || 'เพิ่มรายชื่อไม่สำเร็จ' }); }
  }
  const groupMemberMatch = url.pathname.match(/^\/api\/group-members\/([^/]+)$/);
  if (groupMemberMatch && req.method === 'DELETE') {
    const address = req.socket.remoteAddress || '';
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address) || req.headers['cf-connecting-ip']) return send(res, 403, { error: 'จัดการรายชื่อได้จากเครื่องเจ้าของเว็บเท่านั้น' });
    const members = readGroupMembers(), index = members.findIndex(member => member.id === decodeURIComponent(groupMemberMatch[1]));
    if (index < 0) return send(res, 404, { error: 'ไม่พบรายชื่อนี้' });
    members.splice(index, 1); saveGroupMembers(members); return send(res, 200, { deleted: true });
  }
  if (url.pathname === '/api/members' && req.method === 'POST') {
    const address = req.socket.remoteAddress || '';
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address) || req.headers['cf-connecting-ip']) return send(res, 403, { error: 'จัดการรายชื่อได้จากเครื่องเจ้าของเว็บเท่านั้น' });
    try {
      const body = await receiveBody(req);
      if (body.length > 8 * 1024) return send(res, 413, { error: 'ข้อมูลใหญ่เกินกำหนด' });
      const name = safeText(JSON.parse(body.toString('utf8')).name, 60);
      if (!name) return send(res, 400, { error: 'กรุณากรอกชื่อสมาชิก' });
      const data = JSON.parse(body.toString('utf8'));
      const member = { id: require('crypto').randomUUID(), name, description: safeText(data.description, 500), facebook: cleanMemberSocial(data.facebook), tiktok: cleanMemberSocial(data.tiktok), instagram: cleanMemberSocial(data.instagram), whatsapp: cleanMemberSocial(data.whatsapp, 80), createdAt: Date.now() };
      const members = readMembers(); members.push(member); saveMembers(members);
      return send(res, 201, { member });
    } catch (error) { return send(res, 400, { error: error.message || 'เพิ่มรายชื่อไม่สำเร็จ' }); }
  }
  const memberMatch = url.pathname.match(/^\/api\/members\/([^/]+)$/);
  if (memberMatch && req.method === 'PATCH') {
    const address = req.socket.remoteAddress || '';
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address) || req.headers['cf-connecting-ip']) return send(res, 403, { error: 'จัดการรายชื่อได้จากเครื่องเจ้าของเว็บเท่านั้น' });
    try {
      const body = await receiveBody(req); if (body.length > 8 * 1024) return send(res, 413, { error: 'ข้อมูลใหญ่เกินกำหนด' });
      const data = JSON.parse(body.toString('utf8')), members = readMembers(), member = members.find(item => item.id === decodeURIComponent(memberMatch[1]));
      if (!member) return send(res, 404, { error: 'ไม่พบรายชื่อนี้' });
      member.description = safeText(data.description, 500);
      for (const key of ['facebook', 'tiktok', 'instagram', 'whatsapp']) member[key] = cleanMemberSocial(data[key], key === 'whatsapp' ? 80 : 240);
      saveMembers(members); return send(res, 200, { member });
    } catch (error) { return send(res, 400, { error: error.message || 'บันทึกข้อมูลไม่สำเร็จ' }); }
  }
  if (memberMatch && req.method === 'DELETE') {
    const address = req.socket.remoteAddress || '';
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address) || req.headers['cf-connecting-ip']) return send(res, 403, { error: 'จัดการรายชื่อได้จากเครื่องเจ้าของเว็บเท่านั้น' });
    const members = readMembers(), index = members.findIndex(member => member.id === decodeURIComponent(memberMatch[1]));
    if (index < 0) return send(res, 404, { error: 'ไม่พบรายชื่อนี้' });
    members.splice(index, 1); saveMembers(members); return send(res, 200, { deleted: true });
  }
  if (url.pathname === '/api/tracks' && req.method === 'GET') {
    const tracks = readTracks(); let changed = false;
    for (const track of tracks) {
      if (!['credit', 'remix', 'folder'].includes(track.collection)) { track.collection = track.genre === 'credit' ? 'credit' : 'remix'; changed = true; }
      if (!['lao', 'other'].includes(track.genre)) { track.genre = 'other'; changed = true; }
      if (track.coverChecked) continue;
      track.coverChecked = true; changed = true;
      const audioPath = path.join(UPLOAD_DIR, path.basename(track.id || ''));
      if (!track.id || !fs.existsSync(audioPath) || !fs.statSync(audioPath).isFile()) continue;
      try {
        const cover = extractEmbeddedCover(fs.readFileSync(audioPath), path.extname(track.id).toLowerCase());
        if (cover) {
          const extension = cover.mime === 'image/png' ? 'png' : cover.mime === 'image/webp' ? 'webp' : 'jpg';
          const coverName = `${path.basename(track.id)}.cover.${extension}`;
          fs.writeFileSync(path.join(UPLOAD_DIR, coverName), cover.bytes);
          track.coverUrl = `/uploads/${coverName}`;
        }
      } catch {}
    }
    if (changed) saveTracks(tracks);
    return send(res, 200, tracks);
  }
  const editMatch = url.pathname.match(/^\/api\/tracks\/([^/]+)$/);
  if (editMatch && req.method === 'PATCH') {
    const address = req.socket.remoteAddress || '';
    const localRequest = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address) && !req.headers['cf-connecting-ip'];
    if (!localRequest) return send(res, 403, { error: 'แก้ไขเพลงได้จากหน้า localhost บนเครื่องเจ้าของเว็บเท่านั้น' });
    try {
      const body = await receiveBody(req);
      if (body.length > 8 * 1024) return send(res, 413, { error: 'ข้อมูลแก้ไขใหญ่เกินกำหนด' });
      const changes = JSON.parse(body.toString('utf8'));
      const title = changes.title === undefined ? null : safeText(changes.title, 80);
      if (changes.title !== undefined && !title) return send(res, 400, { error: 'กรุณากรอกชื่อเพลง' });
      const collection = changes.collection === undefined ? null : changes.collection;
      if (collection !== null && !['credit', 'remix'].includes(collection)) return send(res, 400, { error: 'เลือกรายการเพลงไม่ถูกต้อง' });
      if (title === null && collection === null) return send(res, 400, { error: 'ไม่มีข้อมูลที่ต้องการแก้ไข' });
      const id = decodeURIComponent(editMatch[1]);
      const tracks = readTracks();
      const track = tracks.find(item => item.id === id);
      if (!track) return send(res, 404, { error: 'ไม่พบเพลงนี้' });
      if (title !== null) track.title = title;
      if (collection !== null) track.collection = collection;
      saveTracks(tracks);
      return send(res, 200, { track });
    } catch (error) {
      return send(res, 400, { error: error instanceof SyntaxError ? 'ข้อมูลแก้ไขไม่ถูกต้อง' : error.message || 'แก้ไขชื่อเพลงไม่สำเร็จ' });
    }
  }
  if (editMatch && req.method === 'DELETE') {
    const address = req.socket.remoteAddress || '';
    const localRequest = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address) && !req.headers['cf-connecting-ip'];
    if (!localRequest) return send(res, 403, { error: 'ลบเพลงได้จากหน้า localhost บนเครื่องเจ้าของเว็บเท่านั้น' });
    try {
      const id = decodeURIComponent(editMatch[1]);
      if (path.basename(id) !== id) return send(res, 400, { error: 'ชื่อไฟล์ไม่ถูกต้อง' });
      const tracks = readTracks();
      const index = tracks.findIndex(item => item.id === id);
      if (index < 0) return send(res, 404, { error: 'ไม่พบเพลงนี้' });
      const track = tracks[index];
      const filePath = path.join(UPLOAD_DIR, id);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) fs.unlinkSync(filePath);
      if (track.coverUrl) {
        const coverPath = path.join(UPLOAD_DIR, path.basename(track.coverUrl));
        if (coverPath.startsWith(`${UPLOAD_DIR}${path.sep}`) && fs.existsSync(coverPath) && fs.statSync(coverPath).isFile()) fs.unlinkSync(coverPath);
      }
      const [deletedTrack] = tracks.splice(index, 1);
      saveTracks(tracks);
      return send(res, 200, { deleted: true, track: deletedTrack });
    } catch (error) {
      return send(res, 500, { error: error.message || 'ลบเพลงไม่สำเร็จ' });
    }
  }
  const folderDownloadMatch = url.pathname.match(/^\/api\/folders\/([^/]+)\/download$/);
  if (folderDownloadMatch && req.method === 'GET') {
    try {
      const folderId = decodeURIComponent(folderDownloadMatch[1]);
      const tracks = readTracks().filter(track => track.folderId === folderId);
      if (!tracks.length) return send(res, 404, { error: 'ไม่พบ Folder นี้' });
      const entries = []; let totalBytes = 0;
      for (const [index, track] of tracks.entries()) {
        const fileName = path.basename(track.id || '');
        const filePath = path.join(UPLOAD_DIR, fileName);
        if (!fileName || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) continue;
        const stat = fs.statSync(filePath); totalBytes += stat.size;
        if (totalBytes > 250 * 1024 * 1024) return send(res, 413, { error: 'Folder นี้มีขนาดรวมเกิน 250 MB กรุณาดาวน์โหลดแยกเพลง' });
        const originalName = path.basename(track.fileName || track.id);
        const title = safeText(track.title, 80).replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim() || 'เพลง';
        entries.push({ name: `${String(index + 1).padStart(2, '0')} - ${title} - ${originalName}`, trackId: track.id, bytes: fs.readFileSync(filePath) });
      }
      if (!entries.length) return send(res, 404, { error: 'ไม่พบไฟล์เพลงใน Folder นี้' });
      const archive = createZip(entries);
      const downloadedIds = new Set(entries.map(entry => entry.trackId));
      for (const track of tracks) if (downloadedIds.has(track.id)) track.downloads = (Number(track.downloads) || 0) + 1;
      saveTracks(readTracks().map(track => {
        const downloaded = tracks.find(item => item.id === track.id);
        return downloaded ? { ...track, downloads: downloaded.downloads } : track;
      }));
      const folderName = safeText(tracks[0].folderName, 80) || 'LAOS-REMIX-Folder';
      res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': archive.length, 'Content-Disposition': `attachment; filename="LAOS-REMIX-Folder.zip"; filename*=UTF-8''${encodeURIComponent(folderName)}.zip`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
      return res.end(archive);
    } catch (error) {
      return send(res, 500, { error: error.message || 'ดาวน์โหลด Folder ไม่สำเร็จ' });
    }
  }
  const downloadMatch = url.pathname.match(/^\/api\/tracks\/([^/]+)\/download$/);
  if (downloadMatch && req.method === 'GET') {
    const id = decodeURIComponent(downloadMatch[1]);
    const tracks = readTracks();
    const track = tracks.find(item => item.id === id);
    if (!track || !track.fileUrl) return send(res, 404, { error: 'ไม่พบไฟล์เพลง' });
    const fileName = path.basename(track.id || '');
    const filePath = path.join(UPLOAD_DIR, fileName);
    if (!fileName || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return send(res, 404, { error: 'ไม่พบไฟล์เพลงในเซิร์ฟเวอร์' });
    const stat = fs.statSync(filePath);
    let start = 0, end = Math.max(0, stat.size - 1), status = 200;
    const headers = { 'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    const originalName = path.basename(track.fileName || track.id);
    const fallbackName = originalName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_') || 'LAOS-REMIX-audio';
    const encodedName = encodeURIComponent(originalName).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    headers['Content-Disposition'] = `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`;
    if (req.headers.range) {
      const range = req.headers.range.match(/^bytes=(\d*)-(\d*)$/);
      if (!range || (!range[1] && !range[2])) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}`, 'Accept-Ranges': 'bytes' });
        return res.end();
      }
      if (!range[1]) { const suffix = Number(range[2]); start = Math.max(0, stat.size - suffix); end = stat.size - 1; }
      else { start = Number(range[1]); end = range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1; }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}`, 'Accept-Ranges': 'bytes' });
        return res.end();
      }
      status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
    }
    headers['Content-Length'] = end - start + 1;
    track.downloads = (Number(track.downloads) || 0) + 1;
    saveTracks(tracks);
    res.writeHead(status, headers);
    const stream = fs.createReadStream(filePath, { start, end });
    stream.on('error', error => { if (!res.headersSent) send(res, 500, { error: 'อ่านไฟล์เพลงไม่สำเร็จ' }); else res.destroy(error); });
    return stream.pipe(res);
  }
  if (url.pathname === '/api/tracks' && req.method === 'POST') {
    try {
      const contentType = req.headers['content-type'] || '';
      const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
      if (!boundary) return send(res, 400, { error: 'รูปแบบข้อมูลอัปโหลดไม่ถูกต้อง' });
      const { fields, file } = parseMultipart(await receiveBody(req), boundary[1] || boundary[2]);
      const title = safeText(fields.title, 80), artist = safeText(fields.artist, 60);
      const collection = ['credit', 'remix', 'folder'].includes(fields.collection) ? fields.collection : 'remix';
      const genre = ['lao', 'other'].includes(fields.genre) ? fields.genre : 'other';
      const requestedFolderId = safeText(fields.folderId, 80);
      const folderId = /^[a-z0-9-]{8,80}$/i.test(requestedFolderId) ? requestedFolderId : '';
      const folderName = folderId ? safeText(fields.folderName, 80) : '';
      if (!title || !artist || !file) return send(res, 400, { error: 'กรุณากรอกข้อมูลและเลือกไฟล์เพลง' });
      if (file.content.length > MAX_FILE_SIZE) return send(res, 413, { error: 'ไฟล์มีขนาดเกิน 50 MB' });
      const ext = path.extname(file.originalName).toLowerCase();
      if (!allowedExtensions.has(ext)) return send(res, 400, { error: 'รองรับ MP3, WAV, M4A, OGG, OPUS, AAC และ FLAC' });
      const storedName = `${Date.now()}-${require('crypto').randomBytes(6).toString('hex')}${ext}`;
      fs.writeFileSync(path.join(UPLOAD_DIR, storedName), file.content, { flag: 'wx' });
      const track = { id: storedName, title, artist, collection, genre, duration: '—:—', downloads: 0, fileUrl: `/uploads/${storedName}`, fileName: path.basename(file.originalName), coverChecked: true };
      if (folderId && folderName) { track.folderId = folderId; track.folderName = folderName; }
      const cover = extractEmbeddedCover(file.content, ext);
      if (cover) {
        const extension = cover.mime === 'image/png' ? 'png' : cover.mime === 'image/webp' ? 'webp' : 'jpg';
        const coverName = `${storedName}.cover.${extension}`;
        fs.writeFileSync(path.join(UPLOAD_DIR, coverName), cover.bytes);
        track.coverUrl = `/uploads/${coverName}`;
      }
      const tracks = readTracks(); tracks.unshift(track);
      saveTracks(tracks);
      return send(res, 201, { track });
    } catch (error) {
      if (!res.headersSent && !res.destroyed) return send(res, error.statusCode || 500, { error: error.message || 'บันทึกเพลงไม่สำเร็จ' });
      return;
    }
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' });
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { return send(res, 400, { error: 'Bad path' }); }
  const requested = pathname === '/' ? '/index.html' : pathname;
  const target = path.resolve(ROOT, `.${requested}`);
  if (!target.startsWith(`${ROOT}${path.sep}`) || !fs.existsSync(target) || !fs.statSync(target).isFile()) return send(res, 404, { error: 'Not found' });
  const type = mimeTypes[path.extname(target).toLowerCase()] || 'application/octet-stream';
  const stat = fs.statSync(target);
  const range = req.headers.range;
  if (range) {
    const match = range.match(/^bytes=(\d*)-(\d*)$/);
    if (!match || (!match[1] && !match[2])) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}`, 'Accept-Ranges': 'bytes' });
      return res.end();
    }
    let start, end;
    if (!match[1]) {
      const suffixLength = Number(match[2]);
      start = Math.max(0, stat.size - suffixLength);
      end = stat.size - 1;
    } else {
      start = Number(match[1]);
      end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= stat.size || start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}`, 'Accept-Ranges': 'bytes' });
      return res.end();
    }
    res.writeHead(206, {
      'Content-Type': type,
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Content-Length': end - start + 1,
      'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff'
    });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(target, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff' });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(target).pipe(res);
});
server.listen(PORT, '0.0.0.0', () => console.log(`LAOS REMIX is running at http://localhost:${PORT}`));
