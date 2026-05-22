// Sprint garantías-desacopladas CP4-B — Editor reusable de garantías.
//
// Tipos: fiduciaria (con flag solidaria) / hipotecaria / prendaria.
// Las garantías reales (hipotecaria/prendaria) tienen aportante:
//   - cliente del contrato
//   - alguno de los comparecientes vinculados al contrato
//
// Reglas:
//   - banco/bufete (mode='auth'): máx 5 garantías por contrato.
//   - portal cliente (mode='public'): máx 1 garantía, aportante=cliente
//     fijo (no muestra el selector), tipo IN (hipotecaria, prendaria).
//
// Componentes:
//   GarantiasEditor     — lista + form
//   FormGarantia        — el form contextual según tipo
//   AportantePicker     — dropdown cliente + comparecientes (solo mode='auth')

import { useEffect, useState } from 'react';
import { Plus, Trash2, AlertCircle } from 'lucide-react';
import {
  TIPOS_GARANTIA, nombreAportante,
  listGarantiasDelContrato, createGarantia, vincularGarantia, desvincularGarantia,
  publicListGarantias, publicCreateGarantia, publicDeleteGarantia,
} from '../api/garantias';

const MAX_GARANTIAS_AUTH = 5;
const MAX_GARANTIAS_PUBLIC = 1;

export default function GarantiasEditor({
  contratoId, token, institucionId,
  comparecientes = [],   // lista de comparecientes del contrato (para el AportantePicker)
  datosCliente,          // { nombre } del cliente del contrato (para label "Cliente: …")
  mode = 'auth', readOnly = false,
  onChange,
}) {
  const [garantias, setGarantias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const cap = mode === 'public' ? MAX_GARANTIAS_PUBLIC : MAX_GARANTIAS_AUTH;

  const recargar = async () => {
    setLoading(true); setError(null);
    try {
      const rows = mode === 'public'
        ? await publicListGarantias(token)
        : await listGarantiasDelContrato(contratoId);
      setGarantias(rows);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { recargar(); }, [contratoId, token, mode]);

  const quitar = async (gid) => {
    if (!confirm('¿Quitar esta garantía del contrato?')) return;
    setError(null);
    try {
      if (mode === 'public') await publicDeleteGarantia(token, gid);
      else await desvincularGarantia(contratoId, gid);
      await recargar();
      onChange?.();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const agregar = async (datos) => {
    setError(null);
    try {
      if (mode === 'public') {
        // El endpoint público crea + vincula garantía con aportante=cliente automático.
        await publicCreateGarantia(token, { tipo: datos.tipo, datos: datos.datos });
      } else {
        // Auth: crear en catálogo + vincular.
        const garantia = await createGarantia({
          institucion_id: institucionId,
          tipo: datos.tipo,
          solidaria: datos.tipo === 'fiduciaria' ? (datos.solidaria ? 1 : 0) : 0,
          datos: datos.tipo === 'fiduciaria' ? undefined : datos.datos,
          aportante_tipo: datos.tipo === 'fiduciaria' ? undefined : datos.aportante_tipo,
          aportante_cliente_id: datos.aportante_tipo === 'cliente' ? datos.aportante_cliente_id : undefined,
          aportante_compareciente_id: datos.aportante_tipo === 'compareciente' ? datos.aportante_compareciente_id : undefined,
        });
        await vincularGarantia(contratoId, garantia.id);
      }
      setShowForm(false);
      await recargar();
      onChange?.();
    } catch (e) {
      const errMsg = e.response?.data?.error || e.message;
      // Si la validación crítica del aportante saltó (compareciente no está
      // en el contrato), guiar al usuario.
      if (e.response?.data?.falta_compareciente_id) {
        setError(`${errMsg}. Agregue primero al compareciente al contrato (sección "Comparecientes").`);
      } else {
        setError(errMsg);
      }
    }
  };

  const capAlcanzado = garantias.length >= cap;

  return (
    <div className="card">
      <div className="card-h">
        <h3>Garantías <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>({garantias.length}/{cap})</span></h3>
        {!readOnly && !capAlcanzado && !showForm && (
          <button className="btn btn-sm btn-gold" onClick={() => setShowForm(true)}>
            <Plus size={12} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
            Agregar garantía
          </button>
        )}
      </div>

      {mode === 'public' && (
        <div className="alert alert-info" style={{ fontSize: 12.5, margin: '8px 0' }}>
          Si va a aportar un bien (inmueble o vehículo) como garantía propia,
          puede registrarlo aquí. <strong>Máximo 1 desde el portal</strong>; el
          banco puede agregar otras. Es opcional.
        </div>
      )}

      {error && <div className="alert alert-danger" style={{ fontSize: 12.5 }}><AlertCircle size={14} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />{error}</div>}

      {loading ? (
        <div className="empty"><span className="spinner" /></div>
      ) : garantias.length === 0 && !showForm ? (
        <div className="muted" style={{ fontSize: 12.5, padding: '8px 0' }}>
          No hay garantías registradas.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {garantias.map((g) => (
            <div key={g.id || g.garantia_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: 10, background: '#faf9f4', borderRadius: 6, border: '0.5px solid var(--border)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <strong style={{ fontSize: 13, textTransform: 'capitalize' }}>{g.tipo}</strong>
                  {g.tipo === 'fiduciaria' && g.solidaria === 1 && (
                    <span className="badge badge-firmado" style={{ fontSize: 10 }}>solidaria</span>
                  )}
                  {g.congelado_en && (
                    <span className="badge badge-borrador" style={{ fontSize: 10 }}>congelada</span>
                  )}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {g.tipo !== 'fiduciaria' && (
                    <span>Aportante: <strong>{nombreAportante(g, comparecientes, datosCliente) || '—'}</strong></span>
                  )}
                </div>
                {g.datos && (
                  <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 4 }}>
                    {resumenDatos(g.tipo, g.datos)}
                  </div>
                )}
              </div>
              {!readOnly && (
                <button className="btn btn-sm btn-ghost" onClick={() => quitar(g.id || g.garantia_id)} title="Quitar">
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && !readOnly && !capAlcanzado && (
        <FormGarantia
          mode={mode}
          comparecientes={comparecientes}
          datosCliente={datosCliente}
          onSubmit={agregar}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

function resumenDatos(tipo, d) {
  if (tipo === 'hipotecaria') {
    const partes = [];
    if (d.finca) partes.push(`finca ${d.finca}`);
    if (d.folio) partes.push(`folio ${d.folio}`);
    if (d.libro) partes.push(`libro ${d.libro}`);
    if (d.direccion) partes.push(d.direccion);
    return partes.join(' · ');
  }
  if (tipo === 'prendaria') {
    const partes = [];
    if (d.marca) partes.push(d.marca);
    if (d.modelo) partes.push(d.modelo);
    if (d.serie) partes.push(`serie ${d.serie}`);
    if (d.placa) partes.push(`placa ${d.placa}`);
    return partes.join(' · ');
  }
  return null;
}

function FormGarantia({ mode, comparecientes, datosCliente, onSubmit, onCancel }) {
  const tiposDisponibles = mode === 'public'
    ? TIPOS_GARANTIA.filter((t) => t.value !== 'fiduciaria')   // portal: solo bienes reales
    : TIPOS_GARANTIA;

  const [tipo, setTipo] = useState(tiposDisponibles[0].value);
  const [solidaria, setSolidaria] = useState(true);
  const [aportanteTipo, setAportanteTipo] = useState(mode === 'public' ? 'cliente' : 'cliente');
  const [aportanteCompId, setAportanteCompId] = useState(null);
  const [datos, setDatos] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const camposPorTipo = {
    hipotecaria: [
      { key: 'finca', label: 'Finca *', required: true },
      { key: 'folio', label: 'Folio *', required: true },
      { key: 'libro', label: 'Libro *', required: true },
      { key: 'registro', label: 'Registro', placeholder: 'General de la Propiedad' },
      { key: 'direccion', label: 'Dirección' },
      { key: 'area', label: 'Área', placeholder: 'doscientos cincuenta metros cuadrados' },
    ],
    prendaria: [
      { key: 'tipo_bien', label: 'Tipo de bien', placeholder: 'vehículo automotor' },
      { key: 'marca', label: 'Marca *', required: true },
      { key: 'modelo', label: 'Modelo' },
      { key: 'serie', label: 'Serie / VIN *', required: true },
      { key: 'placa', label: 'Placa *', required: true },
    ],
  };

  const validar = () => {
    if (tipo === 'fiduciaria') return true;
    const campos = camposPorTipo[tipo] || [];
    const requeridos = campos.filter((c) => c.required);
    if (!requeridos.every((c) => (datos[c.key] || '').toString().trim())) return false;
    if (mode === 'auth') {
      if (!aportanteTipo) return false;
      if (aportanteTipo === 'compareciente' && !aportanteCompId) return false;
    }
    return true;
  };

  const submit = async (e) => {
    e?.preventDefault();
    if (!validar()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        tipo,
        solidaria: tipo === 'fiduciaria' ? solidaria : false,
        datos: tipo === 'fiduciaria' ? null : datos,
        aportante_tipo: tipo === 'fiduciaria' ? null : aportanteTipo,
        aportante_cliente_id: aportanteTipo === 'cliente' ? (datosCliente?.id || undefined) : undefined,
        aportante_compareciente_id: aportanteTipo === 'compareciente' ? aportanteCompId : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ marginTop: 12, padding: 12, background: '#faf9f4', borderRadius: 6, border: '0.5px dashed var(--border-mid)' }}>
      {/* Tipo de garantía */}
      <div className="field">
        <label>Tipo de garantía *</label>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${tiposDisponibles.length}, 1fr)`, gap: 8 }}>
          {tiposDisponibles.map((t) => (
            <label key={t.value}
              style={{
                padding: 10,
                border: '1px solid ' + (tipo === t.value ? 'var(--gold)' : 'var(--border-mid)'),
                background: tipo === t.value ? 'var(--gold-pale)' : '#fff',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
              }}
            >
              <input type="radio" checked={tipo === t.value} onChange={() => setTipo(t.value)} style={{ marginRight: 6 }} />
              <strong style={{ fontSize: 13 }}>{t.label}</strong>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{t.desc}</div>
            </label>
          ))}
        </div>
      </div>

      {/* Flag solidaria solo para fiduciaria */}
      {tipo === 'fiduciaria' && (
        <div className="field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={solidaria} onChange={(e) => setSolidaria(e.target.checked)} />
            <span>Fianza solidaria, mancomunada y de pago</span>
          </label>
          <div className="muted" style={{ fontSize: 11.5, marginLeft: 22 }}>
            Recomendado para créditos comerciales. Desmarcar solo si la cláusula no debe ser solidaria.
          </div>
        </div>
      )}

      {/* Campos del bien */}
      {tipo !== 'fiduciaria' && (
        <div className="row-2">
          {(camposPorTipo[tipo] || []).map((c) => (
            <div key={c.key} className="field">
              <label>{c.label}</label>
              <input className="input" value={datos[c.key] || ''} onChange={(e) => setDatos({ ...datos, [c.key]: e.target.value })} placeholder={c.placeholder || ''} />
            </div>
          ))}
        </div>
      )}

      {/* Selector de aportante (solo auth y solo para tipos reales) */}
      {tipo !== 'fiduciaria' && mode === 'auth' && (
        <AportantePicker
          datosCliente={datosCliente}
          comparecientes={comparecientes}
          aportanteTipo={aportanteTipo} setAportanteTipo={setAportanteTipo}
          aportanteCompId={aportanteCompId} setAportanteCompId={setAportanteCompId}
        />
      )}

      {/* En modo público el aportante es siempre el cliente */}
      {tipo !== 'fiduciaria' && mode === 'public' && (
        <div className="alert alert-info" style={{ fontSize: 12, margin: '8px 0' }}>
          El aportante será <strong>usted mismo</strong> (cliente del contrato). Si la garantía
          es de otra persona, pídale al banco que la registre.
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
        <button type="button" className="btn btn-sm" onClick={onCancel} disabled={submitting}>Cancelar</button>
        <button type="submit" className="btn btn-sm btn-gold" disabled={!validar() || submitting}>
          {submitting ? 'Guardando…' : 'Agregar garantía'}
        </button>
      </div>
    </form>
  );
}

function AportantePicker({ datosCliente, comparecientes, aportanteTipo, setAportanteTipo, aportanteCompId, setAportanteCompId }) {
  const sinComparecientes = comparecientes.length === 0;
  return (
    <div className="field">
      <label>Aportante del bien *</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="radio"
            checked={aportanteTipo === 'cliente'}
            onChange={() => { setAportanteTipo('cliente'); setAportanteCompId(null); }}
          />
          <span>El cliente del contrato {datosCliente?.nombre ? `(${datosCliente.nombre})` : ''}</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="radio"
            checked={aportanteTipo === 'compareciente'}
            onChange={() => setAportanteTipo('compareciente')}
            disabled={sinComparecientes}
          />
          <span style={{ opacity: sinComparecientes ? 0.55 : 1 }}>
            Un compareciente del contrato {sinComparecientes && '(no hay comparecientes — agréguelos primero)'}
          </span>
        </label>
        {aportanteTipo === 'compareciente' && !sinComparecientes && (
          <select
            className="input"
            value={aportanteCompId || ''}
            onChange={(e) => setAportanteCompId(parseInt(e.target.value, 10) || null)}
            style={{ marginLeft: 22, maxWidth: 320 }}
          >
            <option value="">— Seleccionar compareciente —</option>
            {comparecientes.map((c) => (
              <option key={c.compareciente_id || c.id} value={c.compareciente_id || c.id}>
                {c.nombre} ({c.rol === 'fiador' ? 'fiador' : 'tercero garante'})
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
