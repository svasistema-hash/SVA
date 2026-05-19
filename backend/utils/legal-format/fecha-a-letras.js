// Fecha a letras estilo notarial guatemalteco.
// - Día 1 se dice "primero" (no "uno").
// - Mes en minúsculas.
// - Año precedido por "del año".

const { enteroALetras } = require('./numero-a-letras');

const MESES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function parseIso(input) {
  if (input instanceof Date) {
    return { y: input.getFullYear(), m: input.getMonth() + 1, d: input.getDate() };
  }
  const s = String(input || '').trim();
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) throw new Error(`Fecha inválida: "${input}". Esperado ISO YYYY-MM-DD o Date.`);
  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const d = parseInt(match[3], 10);
  if (m < 1 || m > 12) throw new Error(`Mes fuera de rango: ${m}`);
  if (d < 1 || d > 31) throw new Error(`Día fuera de rango: ${d}`);
  return { y, m, d };
}

function diaALetras(d) {
  if (d === 1) return 'primero';
  return enteroALetras(d);
}

function fechaCortaALetras(iso) {
  const { d, m } = parseIso(iso);
  return `${diaALetras(d)} de ${MESES[m]}`;
}

function fechaALetras(iso) {
  const { y, m, d } = parseIso(iso);
  return `${diaALetras(d)} de ${MESES[m]} del año ${enteroALetras(y)}`;
}

function fechaEnContratoCompleta(iso) {
  return 'el día ' + fechaALetras(iso);
}

module.exports = { fechaALetras, fechaCortaALetras, fechaEnContratoCompleta, diaALetras, parseIso };
