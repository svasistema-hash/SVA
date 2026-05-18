const UNIDADES = [
  '', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE',
  'VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE',
];
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function centenaToWords(n) {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  let words = '';
  if (c > 0) words += CENTENAS[c];
  if (resto > 0) {
    if (c > 0) words += ' ';
    if (resto < 30) {
      words += UNIDADES[resto];
    } else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      words += DECENAS[d];
      if (u > 0) words += ' Y ' + UNIDADES[u];
    }
  }
  return words;
}

function milesToWords(n) {
  if (n === 0) return '';
  if (n === 1) return 'MIL';
  if (n === 21) return 'VEINTIÚN MIL';
  return centenaToWords(n) + ' MIL';
}

function millonesToWords(n) {
  if (n === 0) return '';
  if (n === 1) return 'UN MILLÓN';
  if (n === 21) return 'VEINTIÚN MILLONES';
  return centenaToWords(n) + ' MILLONES';
}

function enteroALetras(n) {
  if (n === 0) return 'CERO';
  if (n < 0) return 'MENOS ' + enteroALetras(-n);
  const millones = Math.floor(n / 1000000);
  const resto = n % 1000000;
  const miles = Math.floor(resto / 1000);
  const centenas = resto % 1000;
  let words = '';
  if (millones > 0) words += millonesToWords(millones);
  if (miles > 0) words += (words ? ' ' : '') + milesToWords(miles);
  if (centenas > 0) words += (words ? ' ' : '') + centenaToWords(centenas);
  return words || 'CERO';
}

export function numeroALetras(amount, moneda = 'GTQ') {
  const num = parseFloat(amount);
  if (isNaN(num)) return '';
  const entero = Math.floor(num);
  const centavos = Math.round((num - entero) * 100);
  const unit = moneda === 'USD' ? 'DÓLARES' : 'QUETZALES';
  let words = enteroALetras(entero) + ' ' + unit;
  if (centavos > 0) {
    words += ' CON ' + enteroALetras(centavos) + ' CENTAVOS';
  } else {
    words += ' EXACTOS';
  }
  return words;
}
