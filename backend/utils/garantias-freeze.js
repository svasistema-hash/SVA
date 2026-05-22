// Sprint garantías-desacopladas CP3 — freeze trigger.
//
// Al pasar un contrato a estado 'completado'/'firmado' copiamos los datos
// vivos de las garantías y comparecientes a los campos snapshot_* en las
// pivotes contrato_garantias y contrato_comparecientes. Una vez congelado
// el motor F7 lee de los snapshots (inmutables) en lugar de las tablas vivas.
//
// Diseño:
//   - Esta función DEBE invocarse dentro de la transacción del cambio de estado.
//   - Solo congela filas con congelado_en IS NULL (idempotente).
//   - No descifra/re-cifra: copia el ciphertext tal cual (la encriptación es
//     consistente entre lectura y escritura, así que no aporta nada decifrar
//     y volver a cifrar — gastaría CPU y rompería la inmutabilidad del bytes).

const db = require('./../db');

const ESTADOS_QUE_CONGELAN = new Set(['completado', 'firmado']);

function debeCongelar(estado) {
  return ESTADOS_QUE_CONGELAN.has(estado);
}

// Llamar con un objeto Database (NO statement) DENTRO de una transacción
// abierta. Si no se pasa db, usa el por defecto.
function freezeContratoGarantias(contrato_id, dbHandle = db) {
  const ahora = new Date().toISOString();

  // Congelar contrato_comparecientes
  const compFilas = dbHandle.prepare(`
    SELECT cc.contrato_id, cc.compareciente_id,
           c.nombre, c.dpi, c.profesion, c.estado_civil, c.domicilio,
           cc.rol
    FROM contrato_comparecientes cc
    JOIN comparecientes c ON c.id = cc.compareciente_id
    WHERE cc.contrato_id = ? AND cc.congelado_en IS NULL
  `).all(contrato_id);

  const updComp = dbHandle.prepare(`
    UPDATE contrato_comparecientes
    SET snapshot_nombre = ?,
        snapshot_dpi = ?,
        snapshot_profesion = ?,
        snapshot_estado_civil = ?,
        snapshot_domicilio = ?,
        snapshot_rol = ?,
        congelado_en = ?
    WHERE contrato_id = ? AND compareciente_id = ?
  `);

  let compsCongelados = 0;
  for (const f of compFilas) {
    updComp.run(
      f.nombre, f.dpi, f.profesion, f.estado_civil, f.domicilio,
      f.rol, ahora,
      f.contrato_id, f.compareciente_id,
    );
    compsCongelados++;
  }

  // Congelar contrato_garantias
  const garFilas = dbHandle.prepare(`
    SELECT cg.contrato_id, cg.garantia_id,
           g.tipo, g.solidaria, g.datos,
           g.aportante_tipo, g.aportante_cliente_id, g.aportante_compareciente_id
    FROM contrato_garantias cg
    JOIN garantias g ON g.id = cg.garantia_id
    WHERE cg.contrato_id = ? AND cg.congelado_en IS NULL
  `).all(contrato_id);

  const updGar = dbHandle.prepare(`
    UPDATE contrato_garantias
    SET snapshot_tipo = ?,
        snapshot_solidaria = ?,
        snapshot_datos = ?,
        snapshot_aportante_tipo = ?,
        snapshot_aportante_cliente_id = ?,
        snapshot_aportante_compareciente_id = ?,
        congelado_en = ?
    WHERE contrato_id = ? AND garantia_id = ?
  `);

  let garsCongeladas = 0;
  for (const g of garFilas) {
    updGar.run(
      g.tipo, g.solidaria, g.datos,
      g.aportante_tipo, g.aportante_cliente_id, g.aportante_compareciente_id,
      ahora,
      g.contrato_id, g.garantia_id,
    );
    garsCongeladas++;
  }

  return { compsCongelados, garsCongeladas, congelado_en: ahora };
}

module.exports = { freezeContratoGarantias, debeCongelar, ESTADOS_QUE_CONGELAN };
