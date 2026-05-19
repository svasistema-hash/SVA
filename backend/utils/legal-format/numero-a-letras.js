// Conversión de números a letras en español, estilo legal guatemalteco.
//
// Reglas:
//  - "uno" → "un" antes de un sustantivo (mil, millón). Idem "veintiuno"→"veintiún", etc.
//  - "cien" cuando 100 va seguido de nada o de un multiplicador (mil/millones).
//    "ciento" cuando 100 va seguido de dígitos: "ciento cinco", "ciento un mil".
//  - decenas con "y" para 31..99: "treinta y uno", "cuarenta y dos".
//  - 21..29 son una sola palabra: "veintiuno", "veintidós", "veintinueve".
//  - millares: "mil" (sin "un"). "veintiún mil", "doscientos mil", "un millón".

const ESPECIALES = {
  0: 'cero',  1: 'uno',  2: 'dos',  3: 'tres',  4: 'cuatro',
  5: 'cinco', 6: 'seis', 7: 'siete', 8: 'ocho', 9: 'nueve',
  10: 'diez', 11: 'once', 12: 'doce', 13: 'trece', 14: 'catorce',
  15: 'quince', 16: 'dieciséis', 17: 'diecisiete', 18: 'dieciocho', 19: 'diecinueve',
  20: 'veinte', 21: 'veintiuno', 22: 'veintidós', 23: 'veintitrés', 24: 'veinticuatro',
  25: 'veinticinco', 26: 'veintiséis', 27: 'veintisiete', 28: 'veintiocho', 29: 'veintinueve',
};

const DECENAS  = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
                  'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

// Si beforeNoun es true, transforma "uno"→"un", "veintiuno"→"veintiún", etc.
function lessThan1000(n, beforeNoun = false) {
  if (n === 0) return '';
  if (n === 100) return 'cien';
  if (n < 30) {
    if (n === 1) return beforeNoun ? 'un' : 'uno';
    if (n === 21) return beforeNoun ? 'veintiún' : 'veintiuno';
    return ESPECIALES[n];
  }
  if (n < 100) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    if (u === 0) return DECENAS[d];
    const uStr = u === 1 ? (beforeNoun ? 'un' : 'uno') : ESPECIALES[u];
    return DECENAS[d] + ' y ' + uStr;
  }
  // 100..999
  const c = Math.floor(n / 100);
  const rest = n % 100;
  if (rest === 0) return c === 1 ? 'cien' : CENTENAS[c];
  return CENTENAS[c] + ' ' + lessThan1000(rest, beforeNoun);
}

function enteroALetras(n, beforeNoun = false) {
  if (typeof n !== 'number') n = parseFloat(n);
  if (!Number.isFinite(n)) throw new Error('enteroALetras: número inválido');
  if (n < 0) throw new Error('enteroALetras: negativos no soportados');
  n = Math.floor(n);
  if (n === 0) return 'cero';
  if (n < 1000) return lessThan1000(n, beforeNoun);

  const millones = Math.floor(n / 1_000_000);
  const miles    = Math.floor((n % 1_000_000) / 1000);
  const resto    = n % 1000;

  const parts = [];
  if (millones > 0) {
    if (millones === 1) parts.push('un millón');
    else                parts.push(lessThan1000(millones, true) + ' millones');
  }
  if (miles > 0) {
    if (miles === 1) parts.push('mil');
    else             parts.push(lessThan1000(miles, true) + ' mil');
  }
  if (resto > 0) {
    parts.push(lessThan1000(resto, beforeNoun));
  }
  return parts.join(' ');
}

// Alias semántico (a veces se llama número en lugar de entero).
function numeroALetras(n) {
  return enteroALetras(n);
}

// Dinero en quetzales: pluraliza y separa centavos.
function dineroALetras(monto) {
  const n = typeof monto === 'number' ? monto : parseFloat(String(monto).replace(/[^\d.\-]/g, ''));
  if (!Number.isFinite(n)) throw new Error('dineroALetras: monto inválido');
  if (n < 0) throw new Error('dineroALetras: negativos no soportados');
  const entero = Math.floor(n);
  // Redondeo a 2 decimales para evitar floats raros (1.005 → 1.00).
  const centavos = Math.round((n - entero) * 100);

  const enteroEnLetras = entero === 1 ? 'un' : enteroALetras(entero, true);
  const moneda = entero === 1 ? 'quetzal' : 'quetzales';

  if (centavos === 0) {
    return `${enteroEnLetras} ${moneda} exactos`;
  }
  const centavosLetras = centavos === 1 ? 'un centavo' : `${enteroALetras(centavos)} centavos`;
  return `${enteroEnLetras} ${moneda} con ${centavosLetras}`;
}

// Lee dígitos decimales como secuencia ("punto cinco", "punto cero cinco").
const DIGITOS = ['cero','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve'];
function decimalALetras(n) {
  if (typeof n !== 'number') n = parseFloat(n);
  if (!Number.isFinite(n)) throw new Error('decimalALetras: inválido');
  if (n < 0) throw new Error('decimalALetras: negativos no soportados');
  const entero = Math.floor(n);
  const enteroPart = enteroALetras(entero);
  const decimals = String(n).split('.')[1] || '';
  const trimmed = decimals.replace(/0+$/, ''); // sin trailing zeros
  if (!trimmed) return enteroPart;
  const decimalsPart = trimmed.split('').map((d) => DIGITOS[parseInt(d, 10)]).join(' ');
  return `${enteroPart} punto ${decimalsPart}`;
}

function porcentajeALetras(n) {
  if (typeof n !== 'number') n = parseFloat(n);
  if (!Number.isFinite(n)) throw new Error('porcentajeALetras: número inválido');
  return decimalALetras(n) + ' por ciento';
}

// formatoLegal: "[letras] ([número])"
//  opciones.tipo: 'entero' | 'dinero' | 'porcentaje' | 'edad' | 'plazo'
//  opciones.sufijo: agregado al final ("meses", "años", "días")
//  opciones.con_parentesis: true por default (poner el número crudo en paréntesis al final)
function formatoLegal(n, opciones = {}) {
  const { tipo = 'entero', sufijo, con_parentesis = true } = opciones;
  let letras, numeroStr;
  switch (tipo) {
    case 'dinero': {
      letras = dineroALetras(n);
      const num = typeof n === 'number' ? n : parseFloat(String(n).replace(/[^\d.\-]/g, ''));
      numeroStr = 'Q' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      break;
    }
    case 'porcentaje': {
      letras = porcentajeALetras(n);
      numeroStr = n + '%';
      break;
    }
    case 'edad': {
      letras = enteroALetras(n) + ' años de edad';
      numeroStr = n;
      break;
    }
    case 'plazo': {
      // El sufijo va FUERA del paréntesis, no dentro: "treinta y seis (36) meses".
      letras = enteroALetras(n);
      numeroStr = String(n);
      return con_parentesis
        ? `${letras} (${numeroStr})${sufijo ? ' ' + sufijo : ''}`
        : letras + (sufijo ? ' ' + sufijo : '');
    }
    case 'entero':
    default:
      letras = enteroALetras(n);
      numeroStr = n + (sufijo ? ' ' + sufijo : '');
      break;
  }
  // edad ya incluye sufijo "años de edad" en letras. Para el paréntesis solo va el número crudo.
  if (tipo === 'edad') {
    return con_parentesis ? `${letras.replace(' años de edad', '')} (${numeroStr}) años de edad` : letras;
  }
  return con_parentesis ? `${letras} (${numeroStr})` : letras;
}

module.exports = { numeroALetras, enteroALetras, dineroALetras, porcentajeALetras, formatoLegal };
