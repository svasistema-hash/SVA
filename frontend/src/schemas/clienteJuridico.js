// Copia ESM del schema de backend/schemas/clienteJuridico.js.
// MANTENER SINCRONIZADO con el backend. Idealmente moveríamos esto a shared/
// pero backend usa CommonJS y frontend ESM, así que por ahora hay duplicación.
import { z } from 'zod';

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

const dpiSchema = z.string().refine(
  (v) => /^\d{13}$/.test(v.replace(/\s/g, '')),
  { message: 'El DPI debe contener exactamente 13 dígitos' }
);

const nitSchema = z.string().refine(
  (v) => {
    const cleaned = v.replace(/[\s-]/g, '');
    return /^\d+[\dKk]?$/.test(cleaned) && cleaned.length >= 4 && cleaned.length <= 12;
  },
  { message: 'NIT inválido. Formato: dígitos opcionalmente con guion y dígito o K verificador' }
);

const moneyInputSchema = z.union([z.string(), z.number()]).refine(
  (v) => {
    const n = parseFloat(String(v).replace(/[^\d.\-]/g, ''));
    return Number.isFinite(n) && n >= 0;
  },
  { message: 'Monto inválido o negativo' }
);

const tipoSociedad = z.enum([
  'S.A.', 'S.R.L.', 'Sociedad Civil', 'E.M.I.',
  'Cooperativa', 'Asociación/Fundación', 'Otra',
]);

const repCargo = z.enum([
  'Administrador Único', 'Presidente', 'Gerente General',
  'Representante Legal designado', 'Apoderado',
]);

const clienteJuridicoSchema = z
  .object({
    nombre: z.string().min(3, 'Razón social muy corta'),
    nit: nitSchema,
    domicilio: z.string().min(5),
    telefono: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),

    nombre_comercial: z.string().optional().or(z.literal('')),
    tipo_sociedad: tipoSociedad,
    tipo_sociedad_otra: z.string().optional().or(z.literal('')),
    objeto_social: z.string().min(5),

    escritura_numero: z.string().min(1),
    escritura_fecha: isoPastDateSchema,
    escritura_notario: z.string().min(3),

    registro_mercantil_numero: z.string().min(1),
    registro_mercantil_folio: z.string().min(1),
    registro_mercantil_libro: z.string().min(1),
    registro_mercantil_fecha: isoPastDateSchema,

    patente_sociedad_numero: z.string().min(1),
    patente_sociedad_fecha: isoPastDateSchema,
    patente_empresa_numero: z.string().min(1),
    patente_empresa_fecha: isoPastDateSchema,

    capital_autorizado: moneyInputSchema,
    capital_suscrito: moneyInputSchema,
    capital_pagado: moneyInputSchema,

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

    regimen_tributario: z.string().optional().or(z.literal('')),
    actividad_economica: z.string().optional().or(z.literal('')),
    fecha_inicio_actividades: isoPastDateSchema.optional().or(z.literal('')),
  })
  .refine(
    (d) => d.tipo_sociedad !== 'Otra' || (d.tipo_sociedad_otra && d.tipo_sociedad_otra.length > 0),
    { message: 'Si tipo_sociedad es "Otra", debe especificar el tipo', path: ['tipo_sociedad_otra'] }
  )
  .refine(
    (d) => new Date(d.registro_mercantil_fecha) >= new Date(d.escritura_fecha),
    { message: 'Fecha de Registro Mercantil no puede ser anterior a la escritura', path: ['registro_mercantil_fecha'] }
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
    { message: 'Acta de nombramiento no puede ser anterior a la escritura', path: ['rep_acta_fecha'] }
  )
  .refine(
    (d) => new Date(d.rep_vigencia_inicio) >= new Date(d.rep_acta_fecha),
    { message: 'La vigencia no puede empezar antes del acta', path: ['rep_vigencia_inicio'] }
  )
  .refine(
    (d) => new Date(d.rep_vigencia_vencimiento) > new Date(d.rep_vigencia_inicio),
    { message: 'El vencimiento debe ser posterior al inicio', path: ['rep_vigencia_vencimiento'] }
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
      const auth = parseFloat(String(d.capital_autorizado).replace(/[^\d.\-]/g, ''));
      const susc = parseFloat(String(d.capital_suscrito).replace(/[^\d.\-]/g, ''));
      const pag  = parseFloat(String(d.capital_pagado).replace(/[^\d.\-]/g, ''));
      return pag <= susc && susc <= auth;
    },
    { message: 'Capital pagado debe ser ≤ suscrito ≤ autorizado', path: ['capital_pagado'] }
  )
  .refine(
    (d) => {
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
      if (d.tipo_sociedad !== 'S.A.') return true;
      const susc = parseFloat(String(d.capital_suscrito).replace(/[^\d.\-]/g, ''));
      const pag  = parseFloat(String(d.capital_pagado).replace(/[^\d.\-]/g, ''));
      return pag >= susc * 0.25;
    },
    {
      message: 'Para Sociedades Anónimas, el capital pagado debe ser al menos el 25% del suscrito (Art. 89 Código de Comercio)',
      path: ['capital_pagado'],
    }
  )
  .refine(
    (d) => {
      if (d.tipo_sociedad !== 'S.A.') return true;
      const pag = parseFloat(String(d.capital_pagado).replace(/[^\d.\-]/g, ''));
      return pag >= 200;
    },
    {
      message: 'Para Sociedades Anónimas, el capital pagado mínimo es Q200.00 (Art. 90 Código de Comercio, Decreto 18-2017)',
      path: ['capital_pagado'],
    }
  );

export {
  clienteJuridicoSchema,
  dpiSchema, nitSchema, moneyInputSchema,
  isoDateSchema, isoPastDateSchema, isoFutureDateSchema,
  tipoSociedad, repCargo,
};
