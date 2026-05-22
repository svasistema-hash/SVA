// CP2.5 — Compila un contrato y lo imprime cláusula por cláusula.
// Detecta posibles violaciones a las 4 reglas (números sueltos, MISSING, etc.).
//
// Uso: node scripts/compile-and-print.js <contrato_id>

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const db = require('../db');
const { decrypt } = require('../encryption');
const { compilarContrato } = require('../contrato-engine');

const id = parseInt(process.argv[2], 10);
if (!id) {
  console.error('uso: node scripts/compile-and-print.js <contrato_id>');
  process.exit(1);
}

const cto = db.prepare('SELECT * FROM contratos WHERE id = ?').get(id);
if (!cto) { console.error('contrato no encontrado'); process.exit(1); }

// Reconstruir el objeto "datos" descifrando los blobs cifrados.
function jsonOrNull(s) { try { return JSON.parse(s); } catch { return null; } }
function safeDec(s) {
  if (!s) return null;
  try { return JSON.parse(decrypt(s)); } catch { return null; }
}

const datos = {
  no_contrato: cto.no_contrato,
  datos_cliente:  safeDec(cto.datos_cliente)  || {},
  datos_credito:  jsonOrNull(cto.datos_credito)  || {},
  datos_garantia: safeDec(cto.datos_garantia) || {},
  datos_firmas:   jsonOrNull(cto.datos_firmas)   || {},
};

const out = compilarContrato(cto.modelo_id, datos, { contrato_id: id });

console.log('═══════════════════════════════════════════════════════════════');
console.log(' CONTRATO COMPILADO  ·  ' + datos.no_contrato);
console.log(' Modelo: ' + out.metadata.modelo.nombre);
console.log(' Cliente: ' + out.metadata.cliente.nombre);
console.log(' Fecha:  ' + datos.datos_firmas.fecha);
console.log('═══════════════════════════════════════════════════════════════\n');

for (const cl of out.clausulas) {
  console.log(`▼ [${cl.orden}] ${cl.titulo}`);
  console.log('  ' + cl.texto + '\n');
}

// Análisis de las 4 reglas
console.log('═══════════════════════════════════════════════════════════════');
console.log(' ANÁLISIS DE REGLAS DE FORMATO');
console.log('═══════════════════════════════════════════════════════════════');

const textoCompleto = out.clausulas.map((c) => c.texto).join('\n');

// R1: detectar variables F7 viejas que no deberían estar
const viejas = [];
const regexVars = /\{\{(\w+)\}\}/g;
let mm;
while ((mm = regexVars.exec(textoCompleto)) !== null) {
  viejas.push(mm[1]);
}
console.log(' R1 (sin {{var}} sin resolver): ' + (viejas.length === 0 ? 'OK' : 'FAIL — ' + viejas.join(', ')));

// R2: detectar números en cifra sola.
// Acepta lo que está entre paréntesis (formato legal "letras (N)").
// Acepta direcciones ("12 calle 8-45 zona 10") porque no son cantidades legales.
// Acepta correlativos ("CT-CP25-0001"), cuenta bancaria ("01-2345-6789"),
// montos en formato Q150,000.00 que vienen ya dentro de paréntesis legales.
const numerosSospechosos = [];
// 1. Quitar TODO contenido entre paréntesis (cualquier número adentro es OK legal).
let textoLimpio = textoCompleto;
// loop porque los paréntesis pueden anidarse o repetirse
let prev = null;
while (prev !== textoLimpio) {
  prev = textoLimpio;
  textoLimpio = textoLimpio.replace(/\([^()]*\)/g, '[OK]');
}
// 2. Quitar correlativos y cuentas bancarias con guiones
textoLimpio = textoLimpio.replace(/\b[A-Z]{2,}-[A-Z0-9-]+/g, '[ID]'); // CT-CP25-0001
textoLimpio = textoLimpio.replace(/\b\d+(?:-\d+)+\b/g, '[CTA]');      // 01-2345-6789, 8-45
// 3. Quitar direcciones (heurística: "<dígito> calle/avenida" o "zona <dígito>")
textoLimpio = textoLimpio.replace(/\b\d+\s+(calle|avenida|av\.)/gi, '[DIR]');
textoLimpio = textoLimpio.replace(/\bzona\s+\d+/gi, '[DIR]');
// 4. Quitar años 19XX / 20XX
textoLimpio = textoLimpio.replace(/\b(19|20)\d{2}\b/g, '[AÑO]');
// 5. Detectar números restantes
const lineRegex = /\b(\d+)(?:[.,]\d+)?\b/g;
let lineMM;
while ((lineMM = lineRegex.exec(textoLimpio)) !== null) {
  const n = lineMM[1];
  numerosSospechosos.push({ num: n, contexto: textoLimpio.substring(Math.max(0, lineMM.index - 30), Math.min(textoLimpio.length, lineMM.index + 60)) });
}
console.log(` R2 (cero números en cifra sola fuera de formato legal): ${numerosSospechosos.length === 0 ? 'OK' : 'REVISAR ' + numerosSospechosos.length + ' ocurrencias'}`);
if (numerosSospechosos.length > 0) {
  for (const s of numerosSospechosos.slice(0, 15)) {
    console.log(`   - "${s.num}" en: "...${s.contexto.replace(/\s+/g, ' ').trim()}..."`);
  }
}

// R3: fechas de pago en formato legal — chequea que las palabras "día" + número-letras estén presentes
const tieneDiaLegal = /día [a-záéíóú]+/i.test(textoCompleto);
console.log(' R3 (fechas/días de pago en formato legal): ' + (tieneDiaLegal ? 'OK' : 'FAIL'));

// R4: sin __MISSING__ ni [VAR]
const tieneMissing = /__MISSING__/.test(textoCompleto);
const tieneBracketVar = /\[([A-Z_]+)\]/.test(textoCompleto);
console.log(' R4 (sin __MISSING__ ni [VAR]): ' + (!tieneMissing && !tieneBracketVar ? 'OK' : 'FAIL'));
if (tieneMissing) console.log('   __MISSING__ presente.');
if (tieneBracketVar) {
  const brackets = [...textoCompleto.matchAll(/\[([A-Z_]+)\]/g)].map((m) => m[1]);
  console.log('   [VAR]: ' + [...new Set(brackets)].join(', '));
}

// Concordancia género (solo informa qué artículo+rol detecta el motor)
console.log(`\n Género detectado en vars: cliente_articulo="${out.vars.cliente_articulo}" cliente_rol_deudor="${out.vars.cliente_rol_deudor}"`);
