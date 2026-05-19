// DPI a letras estilo notarial: cada bloque por separado, con la palabra
// "espacio" literal entre bloques. Ceros iniciales se pronuncian "cero".
//
// Input válido: "2414 58382 0101" o "2414583820101" (normaliza).
// Output: "<letras> espacio <letras> espacio <letras> (2414 58382 0101)"

const { numeroALetras } = require('./numero-a-letras');

function normalizeDpi(dpi) {
  return String(dpi == null ? '' : dpi).replace(/\s+/g, '');
}

function bloqueALetras(bloque) {
  if (!/^\d+$/.test(bloque)) throw new Error('Bloque DPI debe ser numérico: ' + bloque);
  // Si es todo ceros: una "cero" por cada dígito.
  if (/^0+$/.test(bloque)) {
    return Array(bloque.length).fill('cero').join(' ');
  }
  // Cuenta ceros iniciales y los emite literalmente.
  const out = [];
  let i = 0;
  while (i < bloque.length && bloque[i] === '0') {
    out.push('cero');
    i++;
  }
  out.push(numeroALetras(parseInt(bloque.substring(i), 10)));
  return out.join(' ');
}

function dpiALetras(dpi) {
  const norm = normalizeDpi(dpi);
  if (!/^\d{13}$/.test(norm)) {
    throw new Error(`DPI inválido: se esperan 13 dígitos, recibido "${dpi}" (normalizado: "${norm}")`);
  }
  const b1 = norm.substring(0, 4);   // 4 dígitos
  const b2 = norm.substring(4, 9);   // 5 dígitos
  const b3 = norm.substring(9, 13);  // 4 dígitos
  const letras  = `${bloqueALetras(b1)} espacio ${bloqueALetras(b2)} espacio ${bloqueALetras(b3)}`;
  const formato = `${b1} ${b2} ${b3}`;
  return `${letras} (${formato})`;
}

module.exports = { dpiALetras, bloqueALetras, normalizeDpi };
