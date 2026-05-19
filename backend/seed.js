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
       (slug, tipo, nombre, nit, registro_mercantil, autorizacion_sib)
       VALUES (@slug, @tipo, @nombre, @nit, @registro_mercantil, @autorizacion_sib)`
    ).run(INSTITUCION);

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
      { nombre: 'Juan Carlos Pérez García', dpi: '1234 56789 0101', nit: '5678910', estado_civil: 'casado', profesion: 'Ingeniero civil', domicilio: '5a calle 4-50 zona 10, Ciudad de Guatemala', fecha_nac: '1985-03-15', lugar_nac: 'Guatemala', telefono: '5555-1234', email: 'juan.perez@example.gt', ingresos: 18500, empleo: 'Constructora Quetzal, S.A.' },
      { nombre: 'María Fernanda López Soto', dpi: '5678 12345 0102', nit: '9988776', estado_civil: 'soltera', profesion: 'Contadora pública', domicilio: '12 avenida 3-21 zona 1, Quetzaltenango', fecha_nac: '1990-11-22', lugar_nac: 'Quetzaltenango', telefono: '5555-9988', email: 'mflopez@example.gt', ingresos: 14200, empleo: 'Despacho López & Asociados' },
      { nombre: 'José Antonio Méndez Ramírez', dpi: '8765 43210 0103', nit: '1122334', estado_civil: 'union de hecho', profesion: 'Médico cirujano', domicilio: '7a avenida 8-15 zona 14, Ciudad de Guatemala', fecha_nac: '1978-07-04', lugar_nac: 'Antigua Guatemala', telefono: '5555-1122', email: 'dr.mendez@example.gt', ingresos: 32000, empleo: 'Hospital Centro Médico' },
    ];
    // clientes: campos sensibles (dpi, nit, domicilio, ingresos) encriptados;
    // dpi y nit también con hash HMAC para búsqueda exacta.
    const insCliente = db.prepare(
      `INSERT OR IGNORE INTO clientes
       (institucion_id, nombre, dpi, dpi_hash, nit, nit_hash, estado_civil, profesion,
        domicilio, fecha_nac, lugar_nac, telefono, email, ingresos, empleo)
       VALUES (@institucion_id,@nombre,@dpi,@dpi_hash,@nit,@nit_hash,@estado_civil,@profesion,
               @domicilio,@fecha_nac,@lugar_nac,@telefono,@email,@ingresos,@empleo)`
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
      });
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
  };

  console.log('Seed OK');
  console.log(`  Admin       email=${ADMIN.email}  password=${ADMIN.password} (bcrypt hashed)`);
  console.log(`  Institución id=${institucion.id}  slug=${INSTITUCION.slug}  nombre="${INSTITUCION.nombre}"`);
  console.log(`  Modelo      id=${modelo.id}  nombre="${MODELO.nombre}"  garantia=${MODELO.tipo_garantia}`);
  console.log('  Totales:', counts);
}

try {
  run();
} catch (err) {
  console.error('Seed FAILED:', err.message);
  process.exit(1);
}
