// Sprint garantías-desacopladas CP2.5 — Seed alineado al schema nuevo.
//
// Ejecutar: npm run seed:garantias-cp25
//
// Crea (idempotente — si ya existe lo reusa o lo recrea limpio):
//   - 2 clientes individuales en Banco RSG (1 M, 1 F), PII cifrada AES-GCM.
//   - 1 modelo "Crédito Personal F7" con cláusulas que SOLO usan variables F7.
//   - 1 garantía hipotecaria aportada por el cliente masculino.
//   - 1 contrato en estado 'en_curso' del cliente masculino vinculado a esa garantía.
//
// Reglas estrictas de formato en las cláusulas:
//   R1: cero variables viejas — todo {{*_legal}} o vars de comparecencia.
//   R2: cero números en cifra sola — todas las cifras vienen como "letras (N)".
//   R3: días/fechas en formato legal.
//   R4: garantías usan {{garantias_legal}} (incluye aportante visible).

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const db = require('../db');
const { encrypt, hashFor } = require('../encryption');

function log(msg) { console.log('[seed:garantias-cp25]', msg); }

// ─────────────────────────────────────────────────────────────────
// Pre-condiciones
// ─────────────────────────────────────────────────────────────────

const INSTITUCION_SLUG = 'banco-rsg';
const inst = db.prepare('SELECT * FROM instituciones WHERE slug = ?').get(INSTITUCION_SLUG);
if (!inst) {
  console.error(`[seed:garantias-cp25] ERROR: institución '${INSTITUCION_SLUG}' no existe. Correr antes "npm run seed".`);
  process.exit(1);
}

const adminUser = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
const adminId = adminUser?.id || null;

log(`institución: ${inst.nombre} (id=${inst.id})`);

// ─────────────────────────────────────────────────────────────────
// 0. Completar datos del representante banco para que el motor F7
//    pueda generar la frase de comparecencia sin '[EDAD]' y sin
//    'No. 88' literal en el mandato.
// ─────────────────────────────────────────────────────────────────
db.prepare(`
  UPDATE representantes
  SET fecha_nac    = COALESCE(fecha_nac,    '1975-04-12'),
      genero       = COALESCE(genero,       'F'),
      estado_civil = COALESCE(estado_civil, 'casada'),
      profesion    = COALESCE(profesion,    'Abogada y Notaria'),
      escritura_no = CASE
        WHEN escritura_no LIKE 'No.%' THEN TRIM(REPLACE(REPLACE(escritura_no, 'No.', ''), '  ', ' '))
        ELSE escritura_no
      END
  WHERE institucion_id = ? AND activo = 1
`).run(inst.id);
log('representante banco actualizado con fecha_nac/genero/estado_civil/profesion + escritura_no limpia');

// ─────────────────────────────────────────────────────────────────
// 1. CLEAR previous seed-cp25 data (idempotente)
// ─────────────────────────────────────────────────────────────────

const tx = db.transaction(() => {
  // Borrar contratos previos del seed
  const ctosViejos = db.prepare(
    `SELECT id FROM contratos WHERE institucion_id = ? AND no_contrato LIKE 'CT-CP25-%'`
  ).all(inst.id);
  for (const c of ctosViejos) {
    db.prepare('DELETE FROM contrato_garantias WHERE contrato_id = ?').run(c.id);
    db.prepare('DELETE FROM contrato_comparecientes WHERE contrato_id = ?').run(c.id);
    db.prepare('DELETE FROM contratos WHERE id = ?').run(c.id);
  }
  // Borrar garantías + comparecientes huérfanos del seed
  db.prepare(`DELETE FROM garantias WHERE institucion_id = ? AND id NOT IN (SELECT garantia_id FROM contrato_garantias)`).run(inst.id);
  db.prepare(`DELETE FROM comparecientes WHERE institucion_id = ? AND id NOT IN (SELECT compareciente_id FROM contrato_comparecientes)`).run(inst.id);
  // Modelo y clausulas viejos
  const modViejos = db.prepare(`SELECT id FROM modelos WHERE institucion_id = ? AND nombre = 'Crédito Personal F7'`).all(inst.id);
  for (const m of modViejos) {
    db.prepare('DELETE FROM clausulas WHERE modelo_id = ?').run(m.id);
    db.prepare('DELETE FROM modelos WHERE id = ?').run(m.id);
  }
  // Clientes del seed (los identificamos por DPI conocido)
  const dpisSeed = ['2547896301234', '1234567890123'];
  for (const d of dpisSeed) {
    const h = hashFor('dpi', d);
    db.prepare('DELETE FROM clientes WHERE institucion_id = ? AND dpi_hash = ?').run(inst.id, h);
  }
});
tx();
log('cleanup de seed previo OK');

// ─────────────────────────────────────────────────────────────────
// 2. CLIENTES (2 individuales: 1 M, 1 F)
// ─────────────────────────────────────────────────────────────────

function insertCliente(c) {
  const info = db.prepare(`
    INSERT INTO clientes (
      institucion_id, nombre, dpi, dpi_hash,
      fecha_nac, profesion, estado_civil,
      telefono, email, domicilio, genero, tipo_persona, estado
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'individual', 'activo')
  `).run(
    inst.id,
    c.nombre,
    encrypt(c.dpi),
    hashFor('dpi', c.dpi),
    c.fecha_nac,
    c.profesion,
    c.estado_civil,
    c.telefono,
    c.email,
    encrypt(c.domicilio),
    c.genero,
  );
  return info.lastInsertRowid;
}

const cliMascId = insertCliente({
  nombre: 'Carlos Eduardo Méndez Soto',
  dpi: '1234567890123',
  fecha_nac: '1987-03-15',
  profesion: 'Ingeniero Civil',
  estado_civil: 'casado',
  telefono: '5512-3456',
  email: 'carlos.mendez@example.gt',
  domicilio: '12 calle 8-45 zona 10, Ciudad de Guatemala',
  genero: 'M',
});
log(`cliente M creado: id=${cliMascId} (Carlos Eduardo Méndez Soto)`);

const cliFemId = insertCliente({
  nombre: 'María Fernanda López Castillo',
  dpi: '2547896301234',
  fecha_nac: '1992-08-22',
  profesion: 'Médica Cirujana',
  estado_civil: 'soltera',
  telefono: '4498-7766',
  email: 'mfernanda.lopez@example.gt',
  domicilio: '3a avenida 14-20 zona 14, Ciudad de Guatemala',
  genero: 'F',
});
log(`cliente F creado: id=${cliFemId} (María Fernanda López Castillo)`);

// ─────────────────────────────────────────────────────────────────
// 3. MODELO + CLÁUSULAS F7 (cero números sueltos, todo *_legal)
// ─────────────────────────────────────────────────────────────────

const modInfo = db.prepare(`
  INSERT INTO modelos (institucion_id, nombre, tipo_garantia, clausulas, activo)
  VALUES (?, 'Crédito Personal F7', 'hipotecaria', '[]', 1)
`).run(inst.id);
const modId = modInfo.lastInsertRowid;
log(`modelo creado: id=${modId} (Crédito Personal F7)`);

const CLAUSULAS = [
  {
    codigo: 'comparecencia',
    titulo: 'COMPARECENCIA',
    orden: 1,
    obligatoria: 1,
    variables: ['comparecencia'],
    texto_base: '{{comparecencia}}',
  },
  {
    codigo: 'primera-monto',
    titulo: 'Cláusula Primera — Monto y Destino',
    orden: 2,
    obligatoria: 1,
    variables: ['monto_legal', 'destino', 'forma_desembolso'],
    texto_base:
      'EL ACREEDOR otorga a {{cliente_articulo}} {{cliente_rol_deudor}} un crédito por la suma de ' +
      '{{monto_legal}}, destinado exclusivamente a {{destino}}, suma que será entregada mediante {{forma_desembolso}}.',
  },
  {
    codigo: 'segunda-plazo',
    titulo: 'Cláusula Segunda — Plazo',
    orden: 3,
    obligatoria: 1,
    variables: ['plazo_legal', 'fecha_inicio_letras', 'fecha_vencimiento_letras'],
    texto_base:
      'El plazo del presente crédito es de {{plazo_legal}}, contados a partir del {{fecha_inicio_letras}} ' +
      'y venciendo el {{fecha_vencimiento_letras}}.',
  },
  {
    codigo: 'tercera-pago',
    titulo: 'Cláusula Tercera — Forma de Pago',
    orden: 4,
    obligatoria: 1,
    variables: ['cuota_mensual_legal', 'dia_pago_inicio_legal', 'dia_pago_fin_legal', 'forma_pago_legal'],
    texto_base:
      '{{cliente_articulo}} {{cliente_rol_deudor}} se obliga a pagar el capital y los intereses ' +
      'mediante cuotas mensuales niveladas de {{cuota_mensual_legal}}, pagaderas entre el día ' +
      '{{dia_pago_inicio_legal}} y el día {{dia_pago_fin_legal}} de cada mes, mediante {{forma_pago_legal}}.',
  },
  {
    codigo: 'cuarta-intereses',
    titulo: 'Cláusula Cuarta — Intereses',
    orden: 5,
    obligatoria: 1,
    variables: ['tasa_ordinaria_legal', 'tasa_moratoria_legal', 'base_calculo_legal'],
    texto_base:
      'El crédito devengará una tasa de interés ordinario del {{tasa_ordinaria_legal}} anual, ' +
      'calculada sobre saldos en base a un año de {{base_calculo_legal}}. En caso de mora se aplicará ' +
      'adicionalmente una tasa moratoria del {{tasa_moratoria_legal}} anual sobre el capital vencido y no pagado.',
  },
  {
    codigo: 'quinta-garantias',
    titulo: 'Cláusula Quinta — Garantías',
    orden: 6,
    obligatoria: 1,
    variables: ['garantias_legal'],
    texto_base:
      'Para garantizar el íntegro cumplimiento de las obligaciones derivadas del presente contrato, ' +
      '{{cliente_articulo}} {{cliente_rol_deudor}} constituye a favor de EL ACREEDOR las siguientes garantías: ' +
      '{{garantias_legal}}.',
  },
  {
    codigo: 'sexta-mora',
    titulo: 'Cláusula Sexta — Mora y Vencimiento Anticipado',
    orden: 7,
    obligatoria: 1,
    variables: ['cuotas_incumplimiento_legal'],
    texto_base:
      'El incumplimiento por parte de {{cliente_articulo}} {{cliente_rol_deudor}} en el pago de ' +
      '{{cuotas_incumplimiento_legal}} consecutivas, o el incumplimiento de cualquiera de las obligaciones ' +
      'aquí contraídas, dará lugar al vencimiento anticipado del plazo y EL ACREEDOR podrá exigir la ' +
      'inmediata restitución del capital, intereses y accesorios pendientes por la vía ejecutiva.',
  },
  {
    codigo: 'septima-aceptacion',
    titulo: 'Cláusula Séptima — Aceptación',
    orden: 8,
    obligatoria: 1,
    variables: [],
    texto_base:
      'Ambas partes manifiestan haber leído íntegramente el presente contrato, declaran conocer y aceptar ' +
      'sus efectos jurídicos, y en señal de conformidad lo firman en el lugar y fecha indicados en la comparecencia.',
  },
];

const stmtCl = db.prepare(`
  INSERT INTO clausulas (institucion_id, modelo_id, orden, codigo, titulo, texto_base, variables, obligatoria)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
for (const c of CLAUSULAS) {
  stmtCl.run(inst.id, modId, c.orden, c.codigo, c.titulo, c.texto_base, JSON.stringify(c.variables), c.obligatoria);
}
log(`${CLAUSULAS.length} cláusulas insertadas`);

// Actualizar modelo.clausulas con la lista de códigos
const codigos = CLAUSULAS.map((c) => c.codigo);
db.prepare('UPDATE modelos SET clausulas = ? WHERE id = ?').run(JSON.stringify(codigos), modId);

// ─────────────────────────────────────────────────────────────────
// 4. GARANTÍA HIPOTECARIA aportada por cliente M + CONTRATO de prueba
// ─────────────────────────────────────────────────────────────────

const datosGarantia = JSON.stringify({
  finca: 12345,
  folio: 67,
  libro: 8,
  registro: 'Registro General de la Propiedad de la Zona Central',
  direccion: '12 calle 8-45 zona 10, Ciudad de Guatemala',
  area: 'doscientos cincuenta metros cuadrados',
});

const garInfo = db.prepare(`
  INSERT INTO garantias (institucion_id, tipo, solidaria, datos, aportante_tipo, aportante_cliente_id, creado_por_user_id)
  VALUES (?, 'hipotecaria', 0, ?, 'cliente', ?, ?)
`).run(inst.id, encrypt(datosGarantia), cliMascId, adminId);
const garId = garInfo.lastInsertRowid;
log(`garantía hipotecaria creada: id=${garId} (aportante=cliente M)`);

// Datos del contrato (encriptado)
const datosClienteCipher = encrypt(JSON.stringify({
  nombre: 'Carlos Eduardo Méndez Soto',
  dpi: '1234567890123',
  estado_civil: 'casado',
  profesion: 'Ingeniero Civil',
  domicilio: '12 calle 8-45 zona 10, Ciudad de Guatemala',
  genero: 'M',
  fecha_nac: '1987-03-15',
}));

const datosCredito = {
  moneda: 'GTQ',
  monto: '150000.00',
  destino: 'remodelación de vivienda y consolidación de deudas',
  forma_desembolso: 'acreditación en cuenta de ahorros',
  plazo_meses: '60',
  fecha_inicio: '2026-06-01',
  sistema_amort: 'cuotas niveladas',
  cuota_mensual: '3525.40',
  dia_pago_inicio: '5',
  dia_pago_fin: '10',
  cuenta_banco: '01-2345-6789',
  tipo_pago: 'debito_automatico',
  tasa_ordinaria: '14.5',
  base_calculo: '365',
  tasa_moratoria: '5',
  cuotas_incumplimiento: '3',
};

const datosFirmas = {
  notario: 'Lic. Roberto Castillo Aldana',
  colegiado: '8765',
  ciudad: 'Ciudad de Guatemala',
  fecha: '2026-06-01',
  correlativo: 'CT-CP25-0001',
  folio_protocolo: '142',
};

const ctoInfo = db.prepare(`
  INSERT INTO contratos (
    institucion_id, modelo_id, no_contrato, estado,
    datos_cliente, datos_credito, datos_garantia, datos_firmas
  ) VALUES (?, ?, 'CT-CP25-0001', 'en_curso', ?, ?, NULL, ?)
`).run(
  inst.id, modId,
  datosClienteCipher,
  JSON.stringify(datosCredito),
  JSON.stringify(datosFirmas),
);
const ctoId = ctoInfo.lastInsertRowid;
log(`contrato creado: id=${ctoId} no=CT-CP25-0001 (estado en_curso)`);

// Vincular garantía al contrato
db.prepare(`INSERT INTO contrato_garantias (contrato_id, garantia_id, orden) VALUES (?, ?, 1)`).run(ctoId, garId);
log(`vinculación contrato_garantias OK`);

// ─────────────────────────────────────────────────────────────────
// 5. REPORTE
// ─────────────────────────────────────────────────────────────────

console.log('\n=== SEED CP2.5 COMPLETO ===');
console.log(`  cliente M:   id=${cliMascId}  Carlos Eduardo Méndez Soto`);
console.log(`  cliente F:   id=${cliFemId}  María Fernanda López Castillo`);
console.log(`  modelo:      id=${modId}  "Crédito Personal F7" con ${CLAUSULAS.length} cláusulas`);
console.log(`  garantía:    id=${garId}  hipotecaria · aportante=cliente`);
console.log(`  contrato:    id=${ctoId}  CT-CP25-0001  (en_curso)`);
console.log('\nProbar compilación con: node scripts/compile-and-print.js ' + ctoId);

db.close();
