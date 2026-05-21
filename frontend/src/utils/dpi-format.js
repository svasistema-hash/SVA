// Formato visual del DPI guatemalteco mientras el usuario escribe.
// El DPI tiene 13 dígitos agrupados como XXXX XXXXX XXXX.
// El valor que se guarda en backend es el FORMATEADO (con espacios) — así
// matchea el regex del parser OCR y los hashes calculados con normalizeDpi.
//
// Uso típico:
//   <input value={dpi} onChange={(e) => setDpi(formatDpi(e.target.value))} />

/**
 * Toma una string con dígitos (y opcionalmente espacios/guiones) y la devuelve
 * en formato 'XXXX XXXXX XXXX'. Acepta cualquier cantidad de dígitos (≤13),
 * los va agrupando a medida que el usuario escribe.
 *
 * Ejemplos:
 *   ''                 → ''
 *   '1234'             → '1234'
 *   '12345'            → '1234 5'
 *   '123456789'        → '1234 56789'
 *   '1234567890101'    → '1234 56789 0101'
 *   '1234-56789-0101'  → '1234 56789 0101'
 */
export function formatDpi(value) {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '').slice(0, 13);
  const a = digits.slice(0, 4);
  const b = digits.slice(4, 9);
  const c = digits.slice(9, 13);
  return [a, b, c].filter(Boolean).join(' ');
}

/**
 * Devuelve true si el string tiene exactamente 13 dígitos (formato DPI válido,
 * independiente de los separadores).
 */
export function isValidDpiFormat(value) {
  if (!value) return false;
  return String(value).replace(/\D/g, '').length === 13;
}
