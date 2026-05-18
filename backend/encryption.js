const crypto = require('crypto');
const { ENCRYPTION_KEY } = require('./config');

const ALGORITHM = 'aes-256-cbc';
const KEY = crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest();
const IV_LEN = 16;

function encrypt(text) {
  if (text === null || text === undefined || text === '') return text;
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const enc = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}:${enc.toString('base64')}`;
}

function decrypt(payload) {
  if (payload === null || payload === undefined || payload === '') return payload;
  const s = String(payload);
  if (!s.includes(':')) return payload;
  const [ivB64, encB64] = s.split(':');
  try {
    const iv = Buffer.from(ivB64, 'base64');
    const enc = Buffer.from(encB64, 'base64');
    if (iv.length !== IV_LEN) return payload;
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return payload;
  }
}

module.exports = { encrypt, decrypt };

if (require.main === module) {
  const samples = ['1234 56789 0101', '5678910', '18500.50', ''];
  console.log('Test AES-256-CBC encryption (key sha256-derived, IV random 16 bytes):');
  for (const s of samples) {
    const e = encrypt(s);
    const d = decrypt(e);
    const ok = d === s ? '✓' : '✗';
    console.log(`  ${ok} "${s}" -> ${e?.slice(0, 36)}... -> "${d}"`);
  }
}
