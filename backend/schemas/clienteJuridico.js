const { z } = require('zod');

// ─── Helpers reutilizables ─────────────────────────────────────

const isoDateSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}$/,
  'Fecha debe estar en formato YYYY-MM-DD'
);

const isoPastDateSchema = isoDateSchema.refine(
  (d) => new Date(d) <= new Date(),
  { message: 'La fecha no puede ser futura' }
);

const isoFutureDateSchema = isoDateSchema.refine(
  (d) => new Date(d) > new Date(),
  { message: 'La fecha debe ser futura' }
);

// DPI guatemalteco: 13 dígitos. Toleramos espacios internos pero no guiones.
const dpiSchema = z.string().refine(
  (v) => /^\d{13}$/.test(v.replace(/\s/g, '')),
  { message: 'El DPI debe contener exactamente 13 dígitos' }
);

// NIT guatemalteco: dígitos opcionalmente con dígito o K verificador.
const nitSchema = z.string().refine(
  (v) => {
    const cleaned = v.replace(/[\s-]/g, '');
    return /^\d+[\dKk]?$/.test(cleaned) && cleaned.length >= 4 && cleaned.length <= 12;
  },
  { message: 'NIT inválido. Formato: dígitos opcionalmente con guion y dígito o K verificador' }
);

// Monto monetario: string libre (Q123,456.78) o number. No negativo.
const moneyInputSchema = z.union([z.string(), z.number()]).refine(
  (v) => {
    const n = parseFloat(String(v).replace(/[^\d.\-]/g, ''));
    return Number.isFinite(n) && n >= 0;
  },
  { message: 'Monto inválido o negativo' }
);

// ─── Enums ─────────────────────────────────────────────────────

const tipoSociedad = z.enum([
  'S.A.', 'S.R.L.', 'Sociedad Civil', 'E.M.I.',
  'Cooperativa', 'Asociación/Fundación', 'Otra',
]);

const repCargo = z.enum([
  'Administrador Único', 'Presidente', 'Gerente General',
  'Representante Legal designado', 'Apoderado',
]);

// ─── Schema principal ──────────────────────────────────────────

const clienteJuridicoSchema = z
  .object({
    // Identificación base (van a tabla clientes)
    nombre: z.string().min(3, 'Razón social muy corta'),
    nit: nitSchema,
    domicilio: z.string().min(5),
    telefono: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),

    // Identificación jurídica
    nombre_comercial: z.string().optional().or(z.literal('')),
    tipo_sociedad: tipoSociedad,
    tipo_sociedad_otra: z.string().optional().or(z.literal('')),
    objeto_social: z.string().min(5),

    // Constitución
    escritura_numero: z.string().min(1),
    escritura_fecha: isoPastDateSchema,
    escritura_notario: z.string().min(3),

    registro_mercantil_numero: z.string().min(1),
    registro_mercantil_folio: z.string().min(1),
    registro_mercantil_libro: z.string().min(1),
    registro_mercantil_fecha: isoPastDateSchema,

    // Patentes
    patente_sociedad_numero: z.string().min(1),
    patente_sociedad_fecha: isoPastDateSchema,
    patente_empresa_numero: z.string().min(1),
    patente_empresa_fecha: isoPastDateSchema,

    // Capital
    capital_autorizado: moneyInputSchema,
    capital_suscrito: moneyInputSchema,
    capital_pagado: moneyInputSchema,

    // Representante legal
    rep_nombre_completo: z.string().min(5),
    rep_dpi: dpiSchema,
    rep_profesion: z.string().optional().or(z.literal('')),
    rep_cargo: repCargo,
    rep_acta_numero: z.string().min(1),
    rep_acta_fecha: isoPastDateSchema,
    rep_acta_notario: z.string().min(3),
    rep_inscripcion_numero: z.string().min(1),
    rep_inscripcion_folio: z.string().optional().or(z.literal('')),
    rep_inscripcion_libro: z.string().optional().or(z.literal('')),
    rep_vigencia_inicio: isoPastDateSchema,
    rep_vigencia_vencimiento: isoFutureDateSchema,

    // Fiscal (opcional)
    regimen_tributario: z.string().optional().or(z.literal('')),
    actividad_economica: z.string().optional().or(z.literal('')),
    fecha_inicio_actividades: isoPastDateSchema.optional(),
  })
  // ─── Validaciones cruzadas ───────────────────────────────────
  .refine(
    (d) => d.tipo_sociedad !== 'Otra' || (d.tipo_sociedad_otra && d.tipo_sociedad_otra.length > 0),
    { message: 'Si tipo_sociedad es "Otra", debe especificar el tipo en tipo_sociedad_otra', path: ['tipo_sociedad_otra'] }
  )
  .refine(
    (d) => new Date(d.registro_mercantil_fecha) >= new Date(d.escritura_fecha),
    { message: 'Fecha de inscripción en Registro Mercantil no puede ser anterior a la escritura', path: ['registro_mercantil_fecha'] }
  )
  .refine(
    (d) => new Date(d.patente_sociedad_fecha) >= new Date(d.escritura_fecha),
    { message: 'Patente de Sociedad no puede ser anterior a la escritura', path: ['patente_sociedad_fecha'] }
  )
  .refine(
    (d) => new Date(d.patente_empresa_fecha) >= new Date(d.escritura_fecha),
    { message: 'Patente de Empresa no puede ser anterior a la escritura', path: ['patente_empresa_fecha'] }
  )
  .refine(
    (d) => new Date(d.rep_acta_fecha) >= new Date(d.escritura_fecha),
    { message: 'Acta de nombramiento del representante no puede ser anterior a la escritura', path: ['rep_acta_fecha'] }
  )
  .refine(
    (d) => new Date(d.rep_vigencia_inicio) >= new Date(d.rep_acta_fecha),
    { message: 'La vigencia del nombramiento no puede empezar antes del acta', path: ['rep_vigencia_inicio'] }
  )
  .refine(
    (d) => new Date(d.rep_vigencia_vencimiento) > new Date(d.rep_vigencia_inicio),
    { message: 'El vencimiento del nombramiento debe ser posterior al inicio', path: ['rep_vigencia_vencimiento'] }
  )
  .refine(
    (d) => {
      if (!d.fecha_inicio_actividades) return true;
      return new Date(d.fecha_inicio_actividades) >= new Date(d.escritura_fecha);
    },
    { message: 'Fecha de inicio de actividades no puede ser anterior a la escritura', path: ['fecha_inicio_actividades'] }
  )
  .refine(
    (d) => {
      // Capital pagado <= suscrito <= autorizado
      const auth = parseFloat(String(d.capital_autorizado).replace(/[^\d.\-]/g, ''));
      const susc = parseFloat(String(d.capital_suscrito).replace(/[^\d.\-]/g, ''));
      const pag = parseFloat(String(d.capital_pagado).replace(/[^\d.\-]/g, ''));
      return pag <= susc && susc <= auth;
    },
    { message: 'Capital pagado debe ser ≤ suscrito ≤ autorizado', path: ['capital_pagado'] }
  )
  // ─── Reglas del Código de Comercio de Guatemala ──────────────
  .refine(
    (d) => {
      // Art. 162: Administrador Único y Presidente — nombramiento máximo 3 años.
      const cargosLimitados = ['Administrador Único', 'Presidente'];
      if (!cargosLimitados.includes(d.rep_cargo)) return true;
      const inicio = new Date(d.rep_vigencia_inicio);
      const fin = new Date(d.rep_vigencia_vencimiento);
      const diffYears = (fin - inicio) / (365.25 * 24 * 60 * 60 * 1000);
      return diffYears <= 3;
    },
    {
      message: 'Para Administrador Único o Presidente, el Código de Comercio (Art. 162) limita el nombramiento a un máximo de 3 años',
      path: ['rep_vigencia_vencimiento'],
    }
  )
  .refine(
    (d) => {
      // Art. 89: Sociedades Anónimas — capital pagado ≥ 25% del suscrito.
      if (d.tipo_sociedad !== 'S.A.') return true;
      const susc = parseFloat(String(d.capital_suscrito).replace(/[^\d.\-]/g, ''));
      const pag = parseFloat(String(d.capital_pagado).replace(/[^\d.\-]/g, ''));
      return pag >= susc * 0.25;
    },
    {
      message: 'Para Sociedades Anónimas, el capital pagado debe ser al menos el 25% del suscrito (Art. 89 Código de Comercio)',
      path: ['capital_pagado'],
    }
  )
  .refine(
    (d) => {
      // Art. 90 (modificado por Decreto 18-2017): S.A. — capital pagado mínimo Q200.
      if (d.tipo_sociedad !== 'S.A.') return true;
      const pag = parseFloat(String(d.capital_pagado).replace(/[^\d.\-]/g, ''));
      return pag >= 200;
    },
    {
      message: 'Para Sociedades Anónimas, el capital pagado mínimo es Q200.00 (Art. 90 Código de Comercio, modificado por Decreto 18-2017)',
      path: ['capital_pagado'],
    }
  );

// Schema para UPDATE: por implementar cuando lleguemos al PUT con
// superRefine condicional para que las validaciones cruzadas sólo
// se apliquen si los campos involucrados vienen en el body.

module.exports = {
  clienteJuridicoSchema,
  // Helpers individuales por si otros módulos los necesitan:
  dpiSchema,
  nitSchema,
  moneyInputSchema,
  isoDateSchema,
  isoPastDateSchema,
  isoFutureDateSchema,
  tipoSociedad,
  repCargo,
};
