const crypto = require('crypto');
const path = require('path');

// Cargar .env si todavía no lo hizo el caller (config.js / server.js).
// Idempotente: dotenv no sobrescribe variables ya presentes en process.env.
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const KEY_HEX = process.env.ENCRYPTION_KEY;
if (!KEY_HEX) {
  throw new Error('encryption.js: ENCRYPTION_KEY no está definida en el entorno (.env).');
}
if (!/^[0-9a-fA-F]{64}$/.test(KEY_HEX)) {
  throw new Error(
    `encryption.js: ENCRYPTION_KEY debe ser 64 hex chars (32 bytes para AES-256); recibido length=${KEY_HEX.length}.`
  );
}
const KEY = Buffer.from(KEY_HEX, 'hex');

const ALGORITHM = 'aes-256-gcm';
const IV_LEN = 12;   // 96-bit IV recomendado para GCM
const TAG_LEN = 16;  // 128-bit authentication tag

function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return null;
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, authTag]).toString('base64');
}

function decrypt(payloadB64) {
  if (payloadB64 === null || payloadB64 === undefined || payloadB64 === '') return null;
  const buf = Buffer.from(String(payloadB64), 'base64');
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error('decrypt failed: tampered or wrong key');
  }
  const iv = buf.subarray(0, IV_LEN);
  const ciphertext = buf.subarray(IV_LEN, buf.length - TAG_LEN);
  const authTag = buf.subarray(buf.length - TAG_LEN);
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('decrypt failed: tampered or wrong key');
  }
}

function normalize(value) {
  // Quita todo whitespace (interior + extremos) y pasa a mayúsculas.
  // DPI/NIT en GT pueden venir con espacios; NIT puede llevar dígito verificador con letra.
  // Esta función DEBE usarse igual al insertar y al buscar.
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, '').toUpperCase();
}

function hashFor(purpose, value) {
  if (value === null || value === undefined || value === '') return null;
  if (!purpose || typeof purpose !== 'string') {
    throw new Error('hashFor: purpose tag (string) requerido');
  }
  const normalized = normalize(value);
  if (normalized === '') return null;
  // Derivar subkey por purpose para que el mismo valor en columnas distintas no comparta hash.
  const subkey = crypto.createHmac('sha256', KEY).update('purpose:' + purpose).digest();
  return crypto.createHmac('sha256', subkey).update(normalized).digest('hex');
}

function isEncrypted(value) {
  if (typeof value !== 'string' || value.length < 40) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  const buf = Buffer.from(value, 'base64');
  return buf.length >= IV_LEN + TAG_LEN + 1;
}

module.exports = { encrypt, decrypt, hashFor, isEncrypted, normalize };
