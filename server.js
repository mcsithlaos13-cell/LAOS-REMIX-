const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'tracks.json');
const PORT = Number(process.env.PORT || 3000);
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const allowedExtensions = new Set(['.mp3', '.wav', '.m4a', '.ogg', '.aac', '.flac']);
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]\n', 'utf8');

function readTracks() {
  try { const tracks = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); return Array.isArray(tracks) ? tracks : []; }
  catch { return []; }
}
function send(res, status, data, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
}
function safeText(value, max) { return String(value || '').trim().slice(0, max); }
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
    const chunks = []; let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_FILE_SIZE + 1024 * 1024) { reject(new Error('ไฟล์มีขนาดเกิน 50 MB')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
const mimeTypes = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.mp3':'audio/mpeg', '.wav':'audio/wav', '.m4a':'audio/mp4', '.ogg':'audio/ogg', '.aac':'audio/aac', '.flac':'audio/flac' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/tracks' && req.method === 'GET') return send(res, 200, readTracks());
  if (url.pathname === '/api/tracks' && req.method === 'POST') {
    try {
      const contentType = req.headers['content-type'] || '';
      const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
      if (!boundary) return send(res, 400, { error: 'รูปแบบข้อมูลอัปโหลดไม่ถูกต้อง' });
      const { fields, file } = parseMultipart(await receiveBody(req), boundary[1] || boundary[2]);
      const title = safeText(fields.title, 80), artist = safeText(fields.artist, 60);
      const genre = ['remix', 'lao', 'other'].includes(fields.genre) ? fields.genre : 'other';
      if (!title || !artist || !file) return send(res, 400, { error: 'กรุณากรอกข้อมูลและเลือกไฟล์เพลง' });
      if (file.content.length > MAX_FILE_SIZE) return send(res, 413, { error: 'ไฟล์มีขนาดเกิน 50 MB' });
      const ext = path.extname(file.originalName).toLowerCase();
      if (!allowedExtensions.has(ext)) return send(res, 400, { error: 'รองรับ MP3, WAV, M4A, OGG, AAC และ FLAC' });
      const storedName = `${Date.now()}-${require('crypto').randomBytes(6).toString('hex')}${ext}`;
      fs.writeFileSync(path.join(UPLOAD_DIR, storedName), file.content, { flag: 'wx' });
      const track = { id: storedName, title, artist, genre, duration: '—:—', fileUrl: `/uploads/${storedName}`, fileName: path.basename(file.originalName) };
      const tracks = readTracks(); tracks.unshift(track);
      fs.writeFileSync(DB_FILE, `${JSON.stringify(tracks, null, 2)}\n`, 'utf8');
      return send(res, 201, { track });
    } catch (error) {
      if (!res.headersSent && !res.destroyed) return send(res, 500, { error: error.message || 'บันทึกเพลงไม่สำเร็จ' });
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
  res.writeHead(200, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(target).pipe(res);
});
server.listen(PORT, '0.0.0.0', () => console.log(`LAOS REMIX is running at http://localhost:${PORT}`));
