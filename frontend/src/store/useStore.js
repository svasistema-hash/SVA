import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const emptyContrato = () => ({
  institucion_id: null,
  institucion_slug: null,
  modelo_id: null,
  modelo_codigos: [],
  paso: 1,
  cliente_id: null,
  modo_cliente: 'buscar',
  datos_cliente: {
    nombre: '', dpi: '', nit: '', estado_civil: '', profesion: '',
    domicilio: '', fecha_nac: '', lugar_nac: '', telefono: '', email: '',
    ingresos: '', empleo: '',
  },
  datos_credito: {
    monto: '', moneda: 'GTQ', monto_letras: '', destino: '', forma_desembolso: 'acreditación en cuenta',
    tasa_ordinaria: '', base_calculo: '365', tasa_moratoria: '',
    plazo_meses: '', fecha_inicio: '', fecha_vencimiento: '',
    sistema_amort: 'Cuotas niveladas', cuota_mensual: '',
    dia_pago_inicio: '1', dia_pago_fin: '5',
    tipo_pago: 'debito_automatico', cuenta_banco: '',
    cuotas_incumplimiento: '3',
    causales_vencimiento: 'declaración de quiebra, falsedad en los datos proporcionados o destinar los fondos a un fin distinto al pactado',
    via_cobro: 'ejecutiva',
  },
  datos_garantia: {
    tipos: [],
    fiadores: [],
    hipoteca: { finca: '', folio: '', libro: '', registro: 'General de la Propiedad', direccion: '' },
    prenda: { tipo: 'vehículo', marca: '', serie: '', placa: '' },
  },
  datos_firmas: {
    notario: '', colegiado: '', ciudad: 'Ciudad de Guatemala',
    fecha: new Date().toISOString().slice(0, 10),
    correlativo: '', folio_protocolo: '',
  },
  scans: { dpi_path: null, recibo_path: null },
  autoFilled: {},
});

export const useStore = create(
  persist(
    (set) => ({
      user: null,
      token: null,
      institucionActiva: null,
      contratoEnEdicion: null,

      setAuth: (user, token) => set({ user, token }),
      logout: () =>
        set({ user: null, token: null, institucionActiva: null, contratoEnEdicion: null }),

      setInstitucionActiva: (inst) => set({ institucionActiva: inst }),

      iniciarContrato: ({ institucion_id, institucion_slug, modelo_id, modelo_codigos }) => {
        set({
          contratoEnEdicion: {
            ...emptyContrato(),
            institucion_id,
            institucion_slug,
            modelo_id,
            modelo_codigos: modelo_codigos || [],
          },
        });
      },

      cargarContratoExistente: (contrato, slug, modeloCodigos = []) => {
        const base = emptyContrato();
        set({
          contratoEnEdicion: {
            ...base,
            editingId: contrato.id,
            institucion_id: contrato.institucion_id,
            institucion_slug: slug,
            modelo_id: contrato.modelo_id,
            modelo_codigos: modeloCodigos,
            paso: 1,
            datos_cliente: { ...base.datos_cliente, ...(contrato.datos_cliente || {}) },
            datos_credito: { ...base.datos_credito, ...(contrato.datos_credito || {}) },
            datos_garantia: { ...base.datos_garantia, ...(contrato.datos_garantia || {}) },
            datos_firmas: { ...base.datos_firmas, ...(contrato.datos_firmas || {}), correlativo: contrato.no_contrato || '' },
          },
        });
      },

      setPaso: (paso) =>
        set((state) => ({
          contratoEnEdicion: state.contratoEnEdicion ? { ...state.contratoEnEdicion, paso } : null,
        })),

      setModoCliente: (modo_cliente) =>
        set((state) => ({
          contratoEnEdicion: state.contratoEnEdicion
            ? { ...state.contratoEnEdicion, modo_cliente }
            : null,
        })),

      cargarCliente: (cliente) =>
        set((state) => {
          if (!state.contratoEnEdicion) return state;
          const autoFilled = { ...(state.contratoEnEdicion.autoFilled || {}) };
          ['nombre', 'dpi', 'nit', 'estado_civil', 'profesion', 'domicilio', 'fecha_nac', 'lugar_nac', 'telefono', 'email', 'ingresos', 'empleo'].forEach((f) => {
            if (cliente[f] != null && cliente[f] !== '') autoFilled[`datos_cliente.${f}`] = true;
          });
          return {
            contratoEnEdicion: {
              ...state.contratoEnEdicion,
              cliente_id: cliente.id || null,
              datos_cliente: {
                ...state.contratoEnEdicion.datos_cliente,
                nombre: cliente.nombre || '', dpi: cliente.dpi || '', nit: cliente.nit || '',
                estado_civil: cliente.estado_civil || '', profesion: cliente.profesion || '',
                domicilio: cliente.domicilio || '', fecha_nac: cliente.fecha_nac || '',
                lugar_nac: cliente.lugar_nac || '', telefono: cliente.telefono || '',
                email: cliente.email || '', ingresos: cliente.ingresos || '', empleo: cliente.empleo || '',
              },
              autoFilled,
            },
          };
        }),

      updateSection: (section, patch, autoFields = []) =>
        set((state) => {
          if (!state.contratoEnEdicion) return state;
          const current = state.contratoEnEdicion[section] || {};
          const autoFilled = { ...(state.contratoEnEdicion.autoFilled || {}) };
          autoFields.forEach((f) => { autoFilled[`${section}.${f}`] = true; });
          return {
            contratoEnEdicion: {
              ...state.contratoEnEdicion,
              [section]: { ...current, ...patch },
              autoFilled,
            },
          };
        }),

      setScan: (kind, path) =>
        set((state) => ({
          contratoEnEdicion: state.contratoEnEdicion
            ? {
                ...state.contratoEnEdicion,
                scans: { ...state.contratoEnEdicion.scans, [`${kind}_path`]: path },
              }
            : null,
        })),

      resetContrato: () => set({ contratoEnEdicion: null }),
    }),
    {
      name: 'lexdocs-storage',
      partialize: (state) => ({ user: state.user, token: state.token }),
    }
  )
);
