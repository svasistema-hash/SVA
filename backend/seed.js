const bcrypt = require('bcryptjs');
const db = require('./db');
const { encrypt, hashFor } = require('./encryption');
const { normalizeMoney } = require('./utils/money');

const ADMIN = {
  email: 'admin@lexdocs.gt',
  password: 'lexdocs2026',
  nombre: 'Administrador LexDocs',
  role: 'admin',
  institucion_id: null,
};

const INSTITUCION = {
  slug: 'banco-rsg',
  tipo: 'banco',
  nombre: 'Banco RSG, S.A.',
  nit: '1234567-8',
  registro_mercantil: 'Folio 22, Libro 5',
  autorizacion_sib: null,
  correlativo_prefijo: 'BI', // BI-2026-NNNN para contratos del Banco RSG
};

const REPRESENTANTE = {
  nombre: 'Lic. Ana María Rodríguez Soto',
  dpi: '9876 54321 0101',
  cargo: 'Gerente General',
  escritura_no: 'No. 88',
  escritura_fecha: '2023-01-15',
  notario_escritura: 'Lic. Carlos Méndez',
  vencimiento: '2028-01-15',
};

const MODELO = {
  nombre: 'Crédito Personal',
  tipo_garantia: 'personal',
};

const CLAUSULAS = [
  {
    codigo: 'comparecencia',
    titulo: 'COMPARECENCIA',
    orden: 1,
    obligatoria: 1,
    variables: ['fecha', 'lugar', 'notario', 'representante_nombre', 'representante_dpi', 'cliente_nombre', 'cliente_dpi'],
    texto_base:
      'En la ciudad de {{lugar}}, el {{fecha}}, ante mí, {{notario}}, Notario, comparecen: por una parte el(la) señor(a) {{representante_nombre}}, mayor de edad, con Documento Personal de Identificación {{representante_dpi}}, en su calidad de Representante Legal de la institución acreditante; y por la otra, {{cliente_nombre}}, mayor de edad, con Documento Personal de Identificación {{cliente_dpi}}, en lo sucesivo denominado "EL DEUDOR".',
  },
  {
    codigo: 'primera-monto',
    titulo: 'PRIMERA: DEL MONTO',
    orden: 2,
    obligatoria: 1,
    variables: ['monto', 'monto_letras'],
    texto_base:
      'EL ACREEDOR otorga a EL DEUDOR un crédito por la cantidad de {{monto}} ({{monto_letras}} quetzales exactos), suma que EL DEUDOR declara recibir a su entera satisfacción.',
  },
  {
    codigo: 'segunda-plazo',
    titulo: 'SEGUNDA: DEL PLAZO',
    orden: 3,
    obligatoria: 1,
    variables: ['plazo', 'fecha_vencimiento'],
    texto_base:
      'El plazo del presente crédito es de {{plazo}} meses, contados a partir de esta fecha, venciendo en consecuencia el día {{fecha_vencimiento}}.',
  },
  {
    codigo: 'tercera-pago',
    titulo: 'TERCERA: FORMA DE PAGO',
    orden: 4,
    obligatoria: 1,
    variables: ['cuota', 'dia_pago', 'cuenta'],
    texto_base:
      'EL DEUDOR se obliga a pagar el capital e intereses mediante cuotas mensuales, iguales y consecutivas de {{cuota}}, pagaderas el día {{dia_pago}} de cada mes, en la cuenta No. {{cuenta}} de EL ACREEDOR.',
  },
  {
    codigo: 'cuarta-intereses',
    titulo: 'CUARTA: INTERESES',
    orden: 5,
    obligatoria: 1,
    variables: ['tasa_ordinaria', 'tasa_mora'],
    texto_base:
      'El crédito devengará intereses ordinarios a la tasa del {{tasa_ordinaria}}% anual sobre saldos. En caso de mora, EL DEUDOR pagará adicionalmente intereses moratorios del {{tasa_mora}}% anual sobre saldos vencidos, sin perjuicio del cobro judicial correspondiente.',
  },
  {
    codigo: 'quinta-garantias',
    titulo: 'QUINTA: GARANTÍAS',
    orden: 6,
    obligatoria: 1,
    variables: ['tipo_garantia', 'detalle_garantia'],
    texto_base:
      'Para garantizar el cumplimiento de las obligaciones aquí contraídas, EL DEUDOR constituye a favor de EL ACREEDOR garantía {{tipo_garantia}}, según el detalle siguiente: {{detalle_garantia}}.',
  },
  {
    codigo: 'sexta-gastos',
    titulo: 'SEXTA: GASTOS',
    orden: 7,
    obligatoria: 0,
    variables: [],
    texto_base:
      'Todos los gastos notariales, de registro, honorarios profesionales, impuestos y demás derivados del otorgamiento, formalización y eventual ejecución del presente contrato correrán por cuenta exclusiva de EL DEUDOR.',
  },
  {
    codigo: 'septima-incumplimiento',
    titulo: 'SÉPTIMA: INCUMPLIMIENTO',
    orden: 8,
    obligatoria: 1,
    variables: ['dias_mora'],
    texto_base:
      'La falta de pago de una o más cuotas por un período superior a {{dias_mora}} días dará derecho a EL ACREEDOR a dar por vencido anticipadamente el plazo del crédito y exigir judicialmente el pago total del saldo insoluto, intereses ordinarios, moratorios, costas y gastos.',
  },
  {
    codigo: 'octava-disposiciones',
    titulo: 'OCTAVA: DISPOSICIONES FINALES',
    orden: 9,
    obligatoria: 1,
    variables: ['juez_competente'],
    texto_base:
      'Para todos los efectos legales derivados del presente contrato, las partes se someten expresamente a la jurisdicción de los tribunales competentes de {{juez_competente}}, renunciando al fuero de su domicilio. Leído íntegramente el presente instrumento por los comparecientes, lo aceptan, ratifican y firman.',
  },
];

function run() {
  const tx = db.transaction(() => {
    const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get(ADMIN.email);
    if (!existingAdmin) {
      const hash = bcrypt.hashSync(ADMIN.password, 10);
      db.prepare(
        `INSERT INTO users (email, password_hash, nombre, role, institucion_id)
         VALUES (?, ?, ?, ?, ?)`
      ).run(ADMIN.email, hash, ADMIN.nombre, ADMIN.role, ADMIN.institucion_id);
    }

    db.prepare(
      `INSERT OR IGNORE INTO instituciones
       (slug, tipo, nombre, nit, registro_mercantil, autorizacion_sib, correlativo_prefijo)
       VALUES (@slug, @tipo, @nombre, @nit, @registro_mercantil, @autorizacion_sib, @correlativo_prefijo)`
    ).run(INSTITUCION);

    // Patch para BD existentes con correlativo_prefijo NULL (deploy previo al fix).
    db.prepare(
      "UPDATE instituciones SET correlativo_prefijo = ? WHERE slug = ? AND correlativo_prefijo IS NULL"
    ).run(INSTITUCION.correlativo_prefijo, INSTITUCION.slug);

    const institucion = db
      .prepare('SELECT id FROM instituciones WHERE slug = ?')
      .get(INSTITUCION.slug);

    // representantes.dpi se guarda encriptado
    db.prepare(
      `INSERT OR IGNORE INTO representantes
       (institucion_id, nombre, dpi, cargo, escritura_no, escritura_fecha, notario_escritura, vencimiento)
       VALUES (@institucion_id, @nombre, @dpi, @cargo, @escritura_no, @escritura_fecha, @notario_escritura, @vencimiento)`
    ).run({
      institucion_id: institucion.id,
      ...REPRESENTANTE,
      dpi: encrypt(REPRESENTANTE.dpi),
    });

    const codigos = CLAUSULAS.map((c) => c.codigo);
    db.prepare(
      `INSERT OR IGNORE INTO modelos
       (institucion_id, nombre, tipo_garantia, clausulas)
       VALUES (?, ?, ?, ?)`
    ).run(institucion.id, MODELO.nombre, MODELO.tipo_garantia, JSON.stringify(codigos));

    const modelo = db
      .prepare('SELECT id FROM modelos WHERE institucion_id = ? AND nombre = ?')
      .get(institucion.id, MODELO.nombre);

    const insClausula = db.prepare(
      `INSERT OR IGNORE INTO clausulas
       (institucion_id, modelo_id, orden, codigo, titulo, texto_base, variables, obligatoria)
       VALUES (@institucion_id, @modelo_id, @orden, @codigo, @titulo, @texto_base, @variables, @obligatoria)`
    );

    for (const c of CLAUSULAS) {
      insClausula.run({
        institucion_id: institucion.id,
        modelo_id: modelo.id,
        orden: c.orden,
        codigo: c.codigo,
        titulo: c.titulo,
        texto_base: c.texto_base,
        variables: JSON.stringify(c.variables),
        obligatoria: c.obligatoria,
      });
    }

    const sampleClientes = [
      { nombre: 'Juan Carlos Pérez García', dpi: '1234 56789 0101', nit: '5678910', estado_civil: 'casado', profesion: 'Ingeniero civil', domicilio: '5a calle 4-50 zona 10, Ciudad de Guatemala', fecha_nac: '1985-03-15', lugar_nac: 'Guatemala', telefono: '5555-1234', email: 'juan.perez@example.gt', ingresos: 18500, empleo: 'Constructora Quetzal, S.A.', genero: 'masculino' },
      { nombre: 'María Fernanda López Soto', dpi: '5678 12345 0102', nit: '9988776', estado_civil: 'soltera', profesion: 'Contadora pública', domicilio: '12 avenida 3-21 zona 1, Quetzaltenango', fecha_nac: '1990-11-22', lugar_nac: 'Quetzaltenango', telefono: '5555-9988', email: 'mflopez@example.gt', ingresos: 14200, empleo: 'Despacho López & Asociados', genero: 'femenino' },
      { nombre: 'José Antonio Méndez Ramírez', dpi: '8765 43210 0103', nit: '1122334', estado_civil: 'union de hecho', profesion: 'Médico cirujano', domicilio: '7a avenida 8-15 zona 14, Ciudad de Guatemala', fecha_nac: '1978-07-04', lugar_nac: 'Antigua Guatemala', telefono: '5555-1122', email: 'dr.mendez@example.gt', ingresos: 32000, empleo: 'Hospital Centro Médico', genero: 'masculino' },
    ];
    // clientes: campos sensibles (dpi, nit, domicilio, ingresos) encriptados;
    // dpi y nit también con hash HMAC para búsqueda exacta.
    const insCliente = db.prepare(
      `INSERT OR IGNORE INTO clientes
       (institucion_id, nombre, dpi, dpi_hash, nit, nit_hash, estado_civil, profesion,
        domicilio, fecha_nac, lugar_nac, telefono, email, ingresos, empleo, genero)
       VALUES (@institucion_id,@nombre,@dpi,@dpi_hash,@nit,@nit_hash,@estado_civil,@profesion,
               @domicilio,@fecha_nac,@lugar_nac,@telefono,@email,@ingresos,@empleo,@genero)`
    );
    for (const c of sampleClientes) {
      insCliente.run({
        institucion_id: institucion.id,
        nombre: c.nombre,
        dpi: encrypt(c.dpi),
        dpi_hash: hashFor('dpi', c.dpi),
        nit: encrypt(c.nit),
        nit_hash: hashFor('nit', c.nit),
        estado_civil: c.estado_civil,
        profesion: c.profesion,
        domicilio: encrypt(c.domicilio),
        fecha_nac: c.fecha_nac,
        lugar_nac: c.lugar_nac,
        telefono: c.telefono,
        email: c.email,
        ingresos: encrypt(normalizeMoney(c.ingresos)),
        empleo: c.empleo,
        genero: c.genero || null,
      });
    }

    // ─── Clientes Jurídicos (F2) ─────────────────────────────
    // Idempotente: skip si ya existe (institucion_id, nit_hash).
    const sampleJuridicos = [
      {
        nombre: 'Constructora del Sur, S.A.',
        nit: '78901234-5',
        domicilio: '5a avenida 10-25 zona 9, Ciudad de Guatemala',
        telefono: '2222-3333',
        email: 'contacto@constructorasur.gt',
        nombre_comercial: 'CDS',
        tipo_sociedad: 'S.A.',
        objeto_social: 'Construcción y desarrollo inmobiliario',
        escritura_numero: '125',
        escritura_fecha: '2020-03-15',
        escritura_notario: 'Lic. Roberto García Méndez',
        registro_mercantil_numero: 'R-12345',
        registro_mercantil_folio: '88',
        registro_mercantil_libro: '142',
        registro_mercantil_fecha: '2020-04-20',
        patente_sociedad_numero: 'PS-9876',
        patente_sociedad_fecha: '2020-05-10',
        patente_empresa_numero: 'PE-5432',
        patente_empresa_fecha: '2020-05-10',
        capital_autorizado: 5000000,
        capital_suscrito: 2000000,
        capital_pagado: 500000,           // 25% de 2M ✓ Art.89, > Q200 ✓ Art.90
        regimen_tributario: 'Régimen General',
        actividad_economica: 'Construcción',
        fecha_inicio_actividades: '2020-06-01',
        rep_nombre_completo: 'Luis Roberto Ramírez Soto',
        rep_dpi: '2345 67890 0301',
        rep_profesion: 'Ingeniero Civil',
        rep_cargo: 'Gerente General',    // sin límite Art.162
        rep_acta_numero: '7',
        rep_acta_fecha: '2024-01-15',
        rep_acta_notario: 'Lic. Ana María Solís',
        rep_inscripcion_numero: 'I-2024-0089',
        rep_inscripcion_folio: '12',
        rep_inscripcion_libro: '5',
        rep_vigencia_inicio: '2024-01-15',
        rep_vigencia_vencimiento: '2029-01-15', // 5 años, Gerente General permite
      },
      {
        nombre: 'Servicios Mar, S.R.L.',
        nit: '65432198-7',
        domicilio: '12 calle 8-30 zona 4, Ciudad de Guatemala',
        telefono: '2444-5555',
        email: 'admin@serviciosmar.gt',
        nombre_comercial: 'Mar Servicios',
        tipo_sociedad: 'S.R.L.',
        objeto_social: 'Importación y distribución de equipo marítimo',
        escritura_numero: '88',
        escritura_fecha: '2022-09-10',
        escritura_notario: 'Lic. Pedro Antonio Castillo',
        registro_mercantil_numero: 'R-67890',
        registro_mercantil_folio: '156',
        registro_mercantil_libro: '178',
        registro_mercantil_fecha: '2022-10-05',
        patente_sociedad_numero: 'PS-4321',
        patente_sociedad_fecha: '2022-10-20',
        patente_empresa_numero: 'PE-8765',
        patente_empresa_fecha: '2022-10-20',
        capital_autorizado: 200000,
        capital_suscrito: 100000,
        capital_pagado: 100000,           // S.R.L. no aplica Art.89/90
        regimen_tributario: 'Pequeño Contribuyente',
        actividad_economica: 'Comercio',
        fecha_inicio_actividades: '2022-11-01',
        rep_nombre_completo: 'Ana Lucía Soto Méndez',
        rep_dpi: '4567 89012 0103',
        rep_profesion: 'Administradora de Empresas',
        rep_cargo: 'Administrador Único', // limitado a 3 años
        rep_acta_numero: '3',
        rep_acta_fecha: '2024-06-01',
        rep_acta_notario: 'Lic. María del Carmen Vásquez',
        rep_inscripcion_numero: 'I-2024-0145',
        rep_inscripcion_folio: '8',
        rep_inscripcion_libro: '5',
        rep_vigencia_inicio: '2024-06-01',
        rep_vigencia_vencimiento: '2027-06-01', // 3 años exactos (1095 días, no cruza Feb 29 dentro del rango)
      },
    ];

    const insClienteBase = db.prepare(
      `INSERT INTO clientes
       (institucion_id, nombre, nit, nit_hash, domicilio, telefono, email,
        tipo_persona, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'juridica', 'activo')`
    );
    const insJur = db.prepare(
      `INSERT INTO clientes_juridicos
       (cliente_id, nombre_comercial, tipo_sociedad, tipo_sociedad_otra, objeto_social,
        escritura_numero, escritura_fecha, escritura_notario,
        registro_mercantil_numero, registro_mercantil_folio,
        registro_mercantil_libro, registro_mercantil_fecha,
        patente_sociedad_numero, patente_sociedad_fecha,
        patente_empresa_numero, patente_empresa_fecha,
        capital_autorizado, capital_suscrito, capital_pagado,
        regimen_tributario, actividad_economica, fecha_inicio_actividades,
        rep_nombre_completo, rep_dpi, rep_dpi_hash, rep_profesion, rep_cargo,
        rep_acta_numero, rep_acta_fecha, rep_acta_notario,
        rep_inscripcion_numero, rep_inscripcion_folio, rep_inscripcion_libro,
        rep_vigencia_inicio, rep_vigencia_vencimiento)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const j of sampleJuridicos) {
      const nitH = hashFor('nit', j.nit);
      const existing = db.prepare(
        'SELECT id FROM clientes WHERE institucion_id = ? AND nit_hash = ?'
      ).get(institucion.id, nitH);
      if (existing) continue; // idempotente

      const info = insClienteBase.run(
        institucion.id,
        j.nombre,
        encrypt(j.nit), nitH,
        encrypt(j.domicilio),
        j.telefono || null,
        j.email || null
      );
      const clienteId = info.lastInsertRowid;

      insJur.run(
        clienteId,
        j.nombre_comercial || null,
        j.tipo_sociedad, null, j.objeto_social,
        j.escritura_numero, j.escritura_fecha, j.escritura_notario,
        j.registro_mercantil_numero, j.registro_mercantil_folio,
        j.registro_mercantil_libro, j.registro_mercantil_fecha,
        j.patente_sociedad_numero, j.patente_sociedad_fecha,
        j.patente_empresa_numero, j.patente_empresa_fecha,
        encrypt(normalizeMoney(j.capital_autorizado)),
        encrypt(normalizeMoney(j.capital_suscrito)),
        encrypt(normalizeMoney(j.capital_pagado)),
        j.regimen_tributario || null,
        j.actividad_economica || null,
        j.fecha_inicio_actividades || null,
        j.rep_nombre_completo,
        encrypt(j.rep_dpi), hashFor('dpi', j.rep_dpi),
        j.rep_profesion || null, j.rep_cargo,
        j.rep_acta_numero, j.rep_acta_fecha, j.rep_acta_notario,
        j.rep_inscripcion_numero, j.rep_inscripcion_folio || null, j.rep_inscripcion_libro || null,
        j.rep_vigencia_inicio, j.rep_vigencia_vencimiento
      );
    }

    return { institucion, modelo };
  });

  const { institucion, modelo } = tx();

  const counts = {
    users: db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
    instituciones: db.prepare('SELECT COUNT(*) AS n FROM instituciones').get().n,
    representantes: db.prepare('SELECT COUNT(*) AS n FROM representantes').get().n,
    modelos: db.prepare('SELECT COUNT(*) AS n FROM modelos').get().n,
    clausulas: db.prepare('SELECT COUNT(*) AS n FROM clausulas').get().n,
    clientes: db.prepare('SELECT COUNT(*) AS n FROM clientes').get().n,
    clientes_individuales: db.prepare("SELECT COUNT(*) AS n FROM clientes WHERE tipo_persona='individual'").get().n,
    clientes_juridicos: db.prepare("SELECT COUNT(*) AS n FROM clientes WHERE tipo_persona='juridica'").get().n,
  };

  console.log('Seed OK');
  console.log(`  Admin       email=${ADMIN.email}  password=${ADMIN.password} (bcrypt hashed)`);
  console.log(`  Institución id=${institucion.id}  slug=${INSTITUCION.slug}  nombre="${INSTITUCION.nombre}"`);
  console.log(`  Modelo      id=${modelo.id}  nombre="${MODELO.nombre}"  garantia=${MODELO.tipo_garantia}`);
  console.log('  Totales:', counts);
}

module.exports = { run };

// Solo correr automáticamente cuando se invoca como `node seed.js`.
// Cuando se importa con require('./seed'), no se ejecuta — el caller decide.
if (require.main === module) {
  try {
    run();
  } catch (err) {
    console.error('Seed FAILED:', err.message);
    process.exit(1);
  }
}
