import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Topbar from '../components/Topbar';
import Preview from '../components/Preview';
import DpiScanner from '../components/DpiScanner';
import { useStore } from '../store/useStore';
import { fetchInstitucion } from '../api/instituciones';
import { createContrato, generatePdf, openPdf, updateContrato, fetchContrato } from '../api/contratos';
import { searchClientes, createCliente, nextCorrelativo } from '../api/clientes';
import { fetchNotarios, createNotario } from '../api/notarios';
import { numeroALetras } from '../utils/numeroALetras';
import { calcularCuota, formatMoney } from '../utils/cuota';
import { addMonthsISO, fechaLarga } from '../utils/fechas';

const STEPS = [
  { n: 1, label: 'Cliente' },
  { n: 2, label: 'Verificar' },
  { n: 3, label: 'Crédito' },
  { n: 4, label: 'Garantías' },
  { n: 5, label: 'Firmas' },
];

const DESTINOS = [
  'Consumo personal',
  'Capital de trabajo',
  'Compra de vehículo',
  'Compra de vivienda',
  'Educación',
  'Inversión',
];

const PLAZOS = [6, 12, 18, 24, 36, 48, 60, 72, 84, 120];
const DIAS_INICIO = Array.from({ length: 25 }, (_, i) => i + 1);
const DIAS_FIN = Array.from({ length: 27 }, (_, i) => i + 2);
const TIPOS_PAGO = [
  { key: 'debito_automatico', label: 'Débito automático' },
  { key: 'deposito_cuenta', label: 'Depósito en cuenta' },
  { key: 'ventanilla', label: 'Pago en ventanilla' },
];

export default function Wizard() {
  const { slug, id: editingIdParam } = useParams();
  const nav = useNavigate();
  const contrato = useStore((s) => s.contratoEnEdicion);
  const iniciarContrato = useStore((s) => s.iniciarContrato);
  const cargarContratoExistente = useStore((s) => s.cargarContratoExistente);
  const setPaso = useStore((s) => s.setPaso);
  const setModoCliente = useStore((s) => s.setModoCliente);
  const cargarCliente = useStore((s) => s.cargarCliente);
  const updateSection = useStore((s) => s.updateSection);
  const setScan = useStore((s) => s.setScan);
  const resetContrato = useStore((s) => s.resetContrato);

  const isEditMode = !!editingIdParam;

  const [institucion, setInstitucion] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [savedSectionMsg, setSavedSectionMsg] = useState(null);

  useEffect(() => {
    fetchInstitucion(slug).then(async (inst) => {
      setInstitucion(inst);
      if (isEditMode) {
        if (!contrato || contrato.editingId !== Number(editingIdParam)) {
          const c = await fetchContrato(editingIdParam);
          const modelo = inst.modelos?.find((m) => m.id === c.modelo_id) || inst.modelos?.[0];
          cargarContratoExistente(c, slug, modelo?.clausulas || []);
        }
      } else if (!contrato || contrato.institucion_slug !== slug || contrato.editingId) {
        const modelo = inst.modelos?.[0];
        if (modelo) {
          iniciarContrato({
            institucion_id: inst.id,
            institucion_slug: slug,
            modelo_id: modelo.id,
            modelo_codigos: modelo.clausulas || [],
          });
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, editingIdParam]);

  useEffect(() => {
    if (contrato && contrato.paso === 5 && institucion && !contrato.datos_firmas.correlativo) {
      nextCorrelativo(contrato.institucion_id).then((r) => {
        updateSection('datos_firmas', { correlativo: r.correlativo });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contrato?.paso, institucion?.id]);

  if (!contrato || !institucion) {
    return (<><Topbar title="Cargando wizard…" /><div className="app-content"><div className="empty"><span className="spinner" /></div></div></>);
  }

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        institucion_id: contrato.institucion_id,
        modelo_id: contrato.modelo_id,
        no_contrato: contrato.datos_firmas.correlativo || undefined,
        datos_cliente: contrato.datos_cliente,
        datos_credito: contrato.datos_credito,
        datos_garantia: contrato.datos_garantia,
        datos_firmas: contrato.datos_firmas,
      };
      const created = await createContrato(payload);
      await generatePdf(created.id);
      setSuccess({ id: created.id, no_contrato: created.no_contrato });
      await openPdf(created.id);
      setTimeout(() => {
        resetContrato();
        nav(`/instituciones/${slug}/contratos/${created.id}`);
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  const sectionForPaso = (n) => {
    if (n === 1 || n === 2) return 'datos_cliente';
    if (n === 3) return 'datos_credito';
    if (n === 4) return 'datos_garantia';
    return 'datos_firmas';
  };

  const guardarEstePaso = async () => {
    if (!isEditMode) return;
    setSaving(true);
    setError(null);
    setSavedSectionMsg(null);
    try {
      const section = sectionForPaso(contrato.paso);
      await updateContrato(contrato.editingId, { [section]: contrato[section] });
      setSavedSectionMsg(`Sección ${section} guardada`);
      setTimeout(() => setSavedSectionMsg(null), 2500);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  const guardarYSalir = async () => {
    if (!isEditMode) return;
    setSaving(true);
    setError(null);
    try {
      await updateContrato(contrato.editingId, {
        datos_cliente: contrato.datos_cliente,
        datos_credito: contrato.datos_credito,
        datos_garantia: contrato.datos_garantia,
        datos_firmas: contrato.datos_firmas,
      });
      const goto = `/instituciones/${slug}/contratos/${contrato.editingId}`;
      resetContrato();
      nav(goto);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Topbar
        title={isEditMode ? `Editar contrato ${contrato.datos_firmas?.correlativo || ''}` : 'Nuevo contrato'}
        crumbs={`${institucion.nombre} · paso ${contrato.paso} de 5${isEditMode ? ' · modo edición' : ''}`}
        actions={
          <>
            {savedSectionMsg && <span style={{ color: 'var(--success)', fontSize: 12 }}>{savedSectionMsg}</span>}
            {isEditMode && (
              <button className="btn btn-gold" onClick={guardarYSalir} disabled={saving}>
                {saving ? <span className="spinner" /> : 'Guardar y salir'}
              </button>
            )}
            <button className="btn" onClick={() => {
              resetContrato();
              nav(isEditMode ? `/instituciones/${slug}/contratos/${editingIdParam}` : `/instituciones/${slug}/contratos`);
            }}>Cancelar</button>
          </>
        }
      />
      <div className="app-content">
        <div className="wizard-steps">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className={'wizard-step' + (s.n === contrato.paso ? ' active' : s.n < contrato.paso ? ' done' : '')}
              onClick={() => setPaso(s.n)}
            >
              <span className="num">{s.n}.</span>{s.label}
            </div>
          ))}
        </div>

        {error && <div className="card" style={{ background: '#fbeae8', color: '#b54034', marginBottom: 14 }}>{error}</div>}
        {success && (
          <div className="alert alert-success">
            Contrato <strong>{success.no_contrato}</strong> generado. <button type="button" onClick={() => openPdf(success.id)} className="btn-ghost" style={{ background: 'transparent', border: 'none', padding: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>Abrir PDF</button>
          </div>
        )}

        <div className="wizard">
          <div className="wizard-form card">
            {contrato.paso === 1 && (
              <Paso1
                contrato={contrato}
                onModo={setModoCliente}
                onSelectCliente={(c) => { cargarCliente(c); setPaso(2); }}
                onCreate={async (data) => {
                  const c = await createCliente({ ...data, institucion_id: contrato.institucion_id });
                  cargarCliente(c);
                  setPaso(2);
                }}
                onScan={(d) => {
                  setScan('dpi', d.dpi_scan_path);
                  updateSection('datos_cliente', { nombre: d.nombre, dpi: d.dpi, fecha_nac: d.fecha_nac, lugar_nac: d.lugar_nac }, ['nombre','dpi','fecha_nac','lugar_nac']);
                }}
              />
            )}

            {contrato.paso === 2 && (
              <Paso2
                cliente={contrato.datos_cliente}
                af={contrato.autoFilled || {}}
                onChange={(patch) => updateSection('datos_cliente', patch)}
                onScanRecibo={(d) => {
                  setScan('recibo', d.recibo_path);
                  updateSection('datos_cliente', { domicilio: d.domicilio }, ['domicilio']);
                }}
                reciboPath={contrato.scans.recibo_path}
              />
            )}

            {contrato.paso === 3 && (
              <Paso3
                credito={contrato.datos_credito}
                onChange={(p) => updateSection('datos_credito', p)}
                cuentaPredeterminada={institucion?.cuenta_cobro || ''}
              />
            )}

            {contrato.paso === 4 && (
              <Paso4 garantia={contrato.datos_garantia} onChange={(p) => updateSection('datos_garantia', p)} />
            )}

            {contrato.paso === 5 && (
              <Paso5
                slug={slug}
                firmas={contrato.datos_firmas}
                onChange={(p) => updateSection('datos_firmas', p)}
              />
            )}

            <div className="wizard-actions">
              <button className="btn" disabled={contrato.paso === 1} onClick={() => setPaso(contrato.paso - 1)}>← Anterior</button>
              <div style={{ display: 'flex', gap: 8 }}>
                {isEditMode && (
                  <button className="btn" onClick={guardarEstePaso} disabled={saving}>
                    {saving ? <span className="spinner" /> : 'Guardar este paso'}
                  </button>
                )}
                {contrato.paso < 5 ? (
                  <button className="btn btn-gold" onClick={() => setPaso(contrato.paso + 1)}>Siguiente →</button>
                ) : isEditMode ? (
                  <button className="btn btn-gold" onClick={guardarYSalir} disabled={saving}>
                    {saving ? <span className="spinner" /> : 'Guardar y salir'}
                  </button>
                ) : (
                  <button className="btn btn-gold" onClick={submit} disabled={saving}>
                    {saving ? <><span className="spinner" /> Generando…</> : 'Generar contrato y PDF'}
                  </button>
                )}
              </div>
            </div>
          </div>

          <Preview contrato={contrato} institucion={institucion} codigos={contrato.modelo_codigos} />
        </div>
      </div>
    </>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder, auto, readOnly }) {
  return (
    <div className={'field' + (auto ? ' autofilled' : '')}>
      <label>{label}</label>
      <input
        className="input"
        type={type}
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
      />
    </div>
  );
}

function Paso1({ contrato, onModo, onSelectCliente, onCreate, onScan }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const tRef = useRef(null);

  useEffect(() => {
    if (contrato.modo_cliente !== 'buscar') return;
    if (q.trim().length < 2) { setResults([]); return; }
    if (tRef.current) clearTimeout(tRef.current);
    tRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await searchClientes(q.trim(), contrato.institucion_id);
        setResults(data);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(tRef.current);
  }, [q, contrato.institucion_id, contrato.modo_cliente]);

  if (contrato.modo_cliente === 'nuevo') {
    return <ClienteNuevo cliente={contrato.datos_cliente} onScan={onScan} onCancel={() => onModo('buscar')} onSave={onCreate} />;
  }

  return (
    <>
      <div className="card-h"><h3>Paso 1 · Seleccionar cliente</h3></div>
      <p className="muted" style={{ marginTop: 0 }}>Busque por nombre, DPI o NIT. Mínimo 2 caracteres.</p>
      <div className="field">
        <label>Buscar cliente</label>
        <input
          className="input"
          placeholder="Ej: Pérez, 1234, 5678910"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
      </div>

      <div style={{ minHeight: 200, border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', background: '#fff' }}>
        {searching && <div className="empty"><span className="spinner" /> Buscando…</div>}
        {!searching && q.length >= 2 && results.length === 0 && (
          <div className="empty">Sin resultados para "{q}".</div>
        )}
        {!searching && results.length > 0 && (
          <div>
            {results.map((c) => (
              <div
                key={c.id}
                onClick={() => onSelectCliente(c)}
                style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#faf9f4')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
              >
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.nombre}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 2 }}>
                  DPI {c.dpi} · NIT {c.nit || '—'} · {c.profesion || ''}
                </div>
              </div>
            ))}
          </div>
        )}
        {!searching && q.length < 2 && (
          <div className="empty">Escribí al menos 2 caracteres para buscar.</div>
        )}
      </div>

      <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="muted">¿No está en la base de datos?</span>
        <button className="btn btn-gold" onClick={() => onModo('nuevo')}>+ Cliente nuevo</button>
      </div>
    </>
  );
}

function ClienteNuevo({ cliente, onScan, onCancel, onSave }) {
  const [local, setLocal] = useState({
    nombre: cliente.nombre || '', dpi: cliente.dpi || '', nit: cliente.nit || '',
    estado_civil: cliente.estado_civil || '', profesion: cliente.profesion || '',
    domicilio: cliente.domicilio || '', fecha_nac: cliente.fecha_nac || '',
    lugar_nac: cliente.lugar_nac || '', telefono: cliente.telefono || '',
    email: cliente.email || '', ingresos: cliente.ingresos || '', empleo: cliente.empleo || '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const upd = (p) => setLocal((s) => ({ ...s, ...p }));

  return (
    <>
      <div className="card-h">
        <h3>Paso 1 · Cliente nuevo (solicitud)</h3>
        <button className="btn-ghost btn" onClick={onCancel}>← Volver a buscar</button>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>Escaneá el DPI para autocompletar nombre y datos básicos, luego completá el resto.</p>
      <DpiScanner mode="dpi" onResult={(d) => { onScan(d); upd({ nombre: d.nombre, dpi: d.dpi, fecha_nac: d.fecha_nac, lugar_nac: d.lugar_nac }); }} />
      <div className="row-2" style={{ marginTop: 14 }}>
        <Field label="Nombre completo" value={local.nombre} onChange={(v) => upd({ nombre: v })} auto={!!local.nombre} />
        <Field label="DPI / CUI" value={local.dpi} onChange={(v) => upd({ dpi: v })} auto={!!local.dpi} />
      </div>
      <div className="row-2">
        <Field label="NIT" value={local.nit} onChange={(v) => upd({ nit: v })} />
        <div className="field">
          <label>Estado civil</label>
          <select className="select" value={local.estado_civil} onChange={(e) => upd({ estado_civil: e.target.value })}>
            <option value="">—</option>
            <option value="soltero">Soltero/a</option>
            <option value="casado">Casado/a</option>
            <option value="union de hecho">Unión de hecho</option>
            <option value="divorciado">Divorciado/a</option>
            <option value="viudo">Viudo/a</option>
          </select>
        </div>
      </div>
      <Field label="Profesión" value={local.profesion} onChange={(v) => upd({ profesion: v })} />
      <Field label="Domicilio" value={local.domicilio} onChange={(v) => upd({ domicilio: v })} />
      <div className="row-2">
        <Field label="Teléfono" value={local.telefono} onChange={(v) => upd({ telefono: v })} />
        <Field label="Email" value={local.email} onChange={(v) => upd({ email: v })} type="email" />
      </div>
      {err && <div className="field-error">{err}</div>}
      <div style={{ marginTop: 12, textAlign: 'right' }}>
        <button
          className="btn btn-gold"
          disabled={saving || !local.nombre || !local.dpi}
          onClick={async () => {
            setSaving(true); setErr(null);
            try { await onSave(local); }
            catch (e) { setErr(e.response?.data?.error || e.message); }
            finally { setSaving(false); }
          }}
        >
          {saving ? <span className="spinner" /> : 'Guardar cliente y continuar →'}
        </button>
      </div>
    </>
  );
}

function Paso2({ cliente, af, onChange, onScanRecibo, reciboPath }) {
  return (
    <>
      <div className="card-h"><h3>Paso 2 · Verificar datos del cliente</h3></div>
      <p className="muted" style={{ marginTop: 0 }}>
        Datos cargados desde la base de clientes o del DPI. Los campos dorados vienen de la extracción automática y se pueden corregir.
      </p>
      <div className="row-2">
        <Field label="Nombre completo" value={cliente.nombre} onChange={(v) => onChange({ nombre: v })} auto={af['datos_cliente.nombre']} />
        <Field label="DPI / CUI" value={cliente.dpi} onChange={(v) => onChange({ dpi: v })} auto={af['datos_cliente.dpi']} />
      </div>
      <div className="row-2">
        <Field label="NIT" value={cliente.nit} onChange={(v) => onChange({ nit: v })} auto={af['datos_cliente.nit']} />
        <div className={'field' + (af['datos_cliente.estado_civil'] ? ' autofilled' : '')}>
          <label>Estado civil</label>
          <select className="select" value={cliente.estado_civil || ''} onChange={(e) => onChange({ estado_civil: e.target.value })}>
            <option value="">—</option>
            <option value="soltero">Soltero/a</option>
            <option value="casado">Casado/a</option>
            <option value="union de hecho">Unión de hecho</option>
            <option value="divorciado">Divorciado/a</option>
            <option value="viudo">Viudo/a</option>
          </select>
        </div>
      </div>
      <Field label="Profesión" value={cliente.profesion} onChange={(v) => onChange({ profesion: v })} auto={af['datos_cliente.profesion']} />
      <div className="row-2">
        <Field label="Fecha nacimiento" value={cliente.fecha_nac} onChange={(v) => onChange({ fecha_nac: v })} type="date" auto={af['datos_cliente.fecha_nac']} />
        <Field label="Lugar nacimiento" value={cliente.lugar_nac} onChange={(v) => onChange({ lugar_nac: v })} auto={af['datos_cliente.lugar_nac']} />
      </div>
      <Field label="Domicilio" value={cliente.domicilio} onChange={(v) => onChange({ domicilio: v })} auto={af['datos_cliente.domicilio']} />
      <div className="row-2">
        <Field label="Teléfono" value={cliente.telefono} onChange={(v) => onChange({ telefono: v })} auto={af['datos_cliente.telefono']} />
        <Field label="Email" value={cliente.email} onChange={(v) => onChange({ email: v })} type="email" auto={af['datos_cliente.email']} />
      </div>
      <div className="row-2">
        <Field label="Ingresos mensuales (Q)" value={cliente.ingresos} onChange={(v) => onChange({ ingresos: v })} type="number" auto={af['datos_cliente.ingresos']} />
        <Field label="Empleo / patrono" value={cliente.empleo} onChange={(v) => onChange({ empleo: v })} auto={af['datos_cliente.empleo']} />
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="card-h"><h3 style={{ fontSize: 13 }}>Comprobante de domicilio (opcional)</h3></div>
        <DpiScanner mode="recibo" onResult={onScanRecibo} />
        {reciboPath && (
          <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--success)' }}>Recibo cargado: <code>{reciboPath}</code></div>
        )}
      </div>
    </>
  );
}

function RadioGroup({ label, value, onChange, options, columns = 2, renderOption }) {
  return (
    <div className="field">
      <label>{label}</label>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 6 }}>
        {options.map((o) => (
          <label
            key={o}
            style={{
              padding: '7px 10px',
              border: '1px solid ' + (value === o ? 'var(--gold)' : 'var(--border-strong)'),
              background: value === o ? 'var(--gold-soft)' : '#fff',
              borderRadius: 4,
              fontSize: 12.5,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <input type="radio" checked={value === o} onChange={() => onChange(o)} style={{ accentColor: 'var(--gold)' }} />
            {renderOption ? renderOption(o) : o}
          </label>
        ))}
      </div>
    </div>
  );
}

function Paso3({ credito, onChange, cuentaPredeterminada }) {
  const cuotaCalc = useMemo(
    () =>
      calcularCuota({
        monto: credito.monto,
        tasa_ordinaria: credito.tasa_ordinaria,
        plazo_meses: credito.plazo_meses,
        sistema_amort: credito.sistema_amort,
      }),
    [credito.monto, credito.tasa_ordinaria, credito.plazo_meses, credito.sistema_amort]
  );

  const letrasCalc = useMemo(
    () => numeroALetras(credito.monto, credito.moneda),
    [credito.monto, credito.moneda]
  );

  const fechaVencCalc = useMemo(
    () => addMonthsISO(credito.fecha_inicio, credito.plazo_meses),
    [credito.fecha_inicio, credito.plazo_meses]
  );

  useEffect(() => {
    const cuotaFmt = cuotaCalc > 0 ? cuotaCalc.toFixed(2) : '';
    if (cuotaFmt !== (credito.cuota_mensual || '')) onChange({ cuota_mensual: cuotaFmt });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuotaCalc]);

  useEffect(() => {
    if (letrasCalc !== (credito.monto_letras || '')) onChange({ monto_letras: letrasCalc });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letrasCalc]);

  useEffect(() => {
    if (fechaVencCalc !== (credito.fecha_vencimiento || '')) onChange({ fecha_vencimiento: fechaVencCalc });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaVencCalc]);

  useEffect(() => {
    if (
      cuentaPredeterminada &&
      !credito.cuenta_banco &&
      credito.tipo_pago !== 'ventanilla'
    ) {
      onChange({ cuenta_banco: cuentaPredeterminada });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuentaPredeterminada, credito.tipo_pago]);

  const totalPagar = cuotaCalc * (parseInt(credito.plazo_meses, 10) || 0);
  const totalInteres = totalPagar - (parseFloat(credito.monto) || 0);
  const diaInicio = parseInt(credito.dia_pago_inicio, 10) || 0;
  const diaFin = parseInt(credito.dia_pago_fin, 10) || 0;
  const rangoDiasError = diaInicio && diaFin && diaFin <= diaInicio;
  const muestraCuenta = credito.tipo_pago !== 'ventanilla';

  return (
    <>
      <div className="card-h"><h3>Paso 3 · Condiciones del crédito</h3></div>

      <div className="row-3">
        <div className="field">
          <label>Moneda</label>
          <select className="select" value={credito.moneda} onChange={(e) => onChange({ moneda: e.target.value })}>
            <option value="GTQ">GTQ — Quetzales</option>
            <option value="USD">USD — Dólares</option>
          </select>
        </div>
        <Field label="Monto" value={credito.monto} onChange={(v) => onChange({ monto: v })} type="number" />
        <div className="field">
          <label>Monto en letras · auto</label>
          <input
            className="input"
            value={letrasCalc}
            readOnly
            style={{ background: 'var(--gold-soft)', borderColor: 'var(--gold-border)', fontSize: 11.5 }}
          />
        </div>
      </div>

      <RadioGroup label="Destino del crédito" value={credito.destino} onChange={(v) => onChange({ destino: v })} options={DESTINOS} columns={3} />

      <Field label="Forma de desembolso" value={credito.forma_desembolso} onChange={(v) => onChange({ forma_desembolso: v })} />

      <div className="row-3">
        <Field label="Tasa ordinaria (% anual)" value={credito.tasa_ordinaria} onChange={(v) => onChange({ tasa_ordinaria: v })} type="number" />
        <Field label="Tasa moratoria (% anual)" value={credito.tasa_moratoria} onChange={(v) => onChange({ tasa_moratoria: v })} type="number" />
        <div className="field">
          <label>Base de cálculo</label>
          <select className="select" value={credito.base_calculo} onChange={(e) => onChange({ base_calculo: e.target.value })}>
            <option value="365">365 días</option>
            <option value="360">360 días</option>
          </select>
        </div>
      </div>

      <div className="row-3">
        <div className="field">
          <label>Plazo (meses)</label>
          <select className="select" value={credito.plazo_meses} onChange={(e) => onChange({ plazo_meses: e.target.value })}>
            <option value="">—</option>
            {PLAZOS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <Field label="Fecha primera cuota" value={credito.fecha_inicio} onChange={(v) => onChange({ fecha_inicio: v })} type="date" />
        <div className="field">
          <label>Fecha vencimiento · auto</label>
          <input
            className="input"
            value={fechaVencCalc ? fechaLarga(fechaVencCalc) : ''}
            readOnly
            placeholder="Se calcula desde primera cuota + plazo"
            style={{ background: 'var(--gold-pale)', borderColor: 'var(--gold-border)', fontSize: 12 }}
          />
        </div>
      </div>

      <RadioGroup label="Sistema de amortización" value={credito.sistema_amort} onChange={(v) => onChange({ sistema_amort: v })} options={['Cuotas niveladas', 'Bullet']} columns={2} />

      <div className="card" style={{ background: 'var(--gold-soft)', borderColor: 'var(--gold-border)' }}>
        <div className="card-h"><h3 style={{ fontSize: 13 }}>Cálculo automático</h3></div>
        <div className="row-3">
          <div className="field">
            <label>Cuota mensual · auto</label>
            <input className="input" value={cuotaCalc > 0 ? formatMoney(cuotaCalc, credito.moneda) : ''} readOnly style={{ background: '#fff', borderColor: 'var(--gold)', fontWeight: 600 }} />
          </div>
          <div className="field">
            <label>Total a pagar</label>
            <input className="input" value={totalPagar > 0 ? formatMoney(totalPagar, credito.moneda) : ''} readOnly style={{ background: '#fff', borderColor: 'var(--gold-border)' }} />
          </div>
          <div className="field">
            <label>Total intereses</label>
            <input className="input" value={totalInteres > 0 ? formatMoney(totalInteres, credito.moneda) : ''} readOnly style={{ background: '#fff', borderColor: 'var(--gold-border)' }} />
          </div>
        </div>
        <div className="muted" style={{ fontSize: 11 }}>
          {credito.sistema_amort === 'Bullet'
            ? 'Bullet: sólo intereses mensuales · capital al vencimiento.'
            : 'Sistema francés: cuotas niveladas con amortización gradual del capital.'}
        </div>
      </div>

      <RadioGroup label="Tipo de pago" value={credito.tipo_pago} onChange={(v) => onChange({ tipo_pago: v })} options={TIPOS_PAGO.map((t) => t.key)} columns={3} renderOption={(k) => TIPOS_PAGO.find((t) => t.key === k)?.label || k} />

      {muestraCuenta && (
        <div className="field">
          <label>
            Cuenta No.
            {cuentaPredeterminada && credito.cuenta_banco === cuentaPredeterminada && (
              <span className="gold" style={{ fontWeight: 500 }}> · precargada del tenant</span>
            )}
          </label>
          <input className="input" value={credito.cuenta_banco || ''} onChange={(e) => onChange({ cuenta_banco: e.target.value })} placeholder="01-2345-6789" />
        </div>
      )}

      <div className="card">
        <div className="card-h"><h3 style={{ fontSize: 13 }}>Día de pago</h3></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span>El pago se realizará entre el día</span>
          <select className="select" style={{ width: 80 }} value={credito.dia_pago_inicio} onChange={(e) => onChange({ dia_pago_inicio: e.target.value })}>
            {DIAS_INICIO.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <span>y el día</span>
          <select className="select" style={{ width: 80 }} value={credito.dia_pago_fin} onChange={(e) => onChange({ dia_pago_fin: e.target.value })}>
            {DIAS_FIN.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <span>de cada mes.</span>
        </div>
        {rangoDiasError && (
          <div className="field-error" style={{ marginTop: 8 }}>
            El día final debe ser mayor al día inicial.
          </div>
        )}
      </div>
    </>
  );
}

const REGISTROS_PROPIEDAD = [
  '1° Registro — Guatemala',
  '2° Registro — Quetzaltenango',
  '3° Registro — Zacapa',
  '4° Registro — Santa Ana',
  '5° Registro — Escuintla',
];

const TIPOS_BIEN_PRENDA = ['Vehículo', 'Motocicleta', 'Maquinaria', 'Equipo', 'Otro'];

const ESTADOS_CIVILES_FIADOR = [
  { v: 'soltero', l: 'Soltero/a' },
  { v: 'casado', l: 'Casado/a' },
  { v: 'divorciado', l: 'Divorciado/a' },
  { v: 'viudo', l: 'Viudo/a' },
  { v: 'union de hecho', l: 'Unido/a de hecho' },
];

function nuevoFiadorVacio() {
  return {
    nombre: '', dpi: '', fecha_nac: '', lugar_nac: '',
    estado_civil: '', conyuge_nombre: '', conyuge_dpi: '',
    profesion: '', nit: '', telefono: '', email: '',
    domicilio: '', recibo_path: null,
    tipo_garantia: 'personal',
    hipoteca: { finca: '', folio: '', libro: '', registro: REGISTROS_PROPIEDAD[0], direccion: '', area: '', valor: '' },
    prenda: { tipo_bien: 'Vehículo', marca: '', modelo: '', serie: '', placa: '', valor: '' },
  };
}

function Paso4({ garantia, onChange }) {
  const fiadores = garantia.fiadores || [];
  const setFiador = (i, patch) => {
    const fs = [...fiadores];
    fs[i] = { ...(fs[i] || {}), ...patch };
    onChange({ fiadores: fs });
  };
  const addFiador = () => onChange({ fiadores: [...fiadores, nuevoFiadorVacio()] });
  const removeFiador = (i) => onChange({ fiadores: fiadores.filter((_, idx) => idx !== i) });

  return (
    <>
      <div className="card-h">
        <h3>Paso 4 · Garantías</h3>
        <button className="btn btn-gold btn-sm" onClick={addFiador}>Agregar fiador</button>
      </div>

      <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
        Cada fiador requiere la misma información que el cliente principal más el tipo de garantía que aporta.
      </p>

      {fiadores.length === 0 && (
        <div className="empty">Aún no hay fiadores. Agregue uno o continúe sin garantías adicionales.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {fiadores.map((f, i) => (
          <FiadorCard
            key={i}
            index={i}
            fiador={f}
            onPatch={(p) => setFiador(i, p)}
            onRemove={() => removeFiador(i)}
          />
        ))}
      </div>
    </>
  );
}

function FiadorCard({ index, fiador, onPatch, onRemove }) {
  const [expanded, setExpanded] = useState(true);

  const TIPO_LABEL = { personal: 'Personal', hipotecaria: 'Hipotecaria', prendaria: 'Prendaria' };
  const headerNombre = fiador.nombre || `Fiador ${index + 1}`;

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div
        onClick={() => setExpanded((e) => !e)}
        style={{
          padding: '12px 16px',
          background: 'var(--bg-subtle)',
          borderBottom: expanded ? '1px solid var(--border-light)' : 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div style={{ fontFamily: 'Libre Baskerville, serif', fontSize: 14 }}>
            Fiador {index + 1} — {headerNombre}
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
            {TIPO_LABEL[fiador.tipo_garantia] || 'Personal'}
            {fiador.dpi ? ` · DPI ${fiador.dpi}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 11 }}>{expanded ? 'Contraer' : 'Expandir'}</span>
          <button
            className="btn btn-sm btn-danger"
            onClick={(e) => { e.stopPropagation(); if (confirm(`¿Eliminar Fiador ${index + 1}?`)) onRemove(); }}
          >Eliminar</button>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: 18 }}>
          <SectionLabel>Identificación</SectionLabel>
          <div className="row-2">
            <Field label="Nombre completo *" value={fiador.nombre} onChange={(v) => onPatch({ nombre: v })} />
            <Field label="DPI / CUI *" value={fiador.dpi} onChange={(v) => onPatch({ dpi: v })} />
          </div>
          <div className="row-2">
            <Field label="Fecha de nacimiento" value={fiador.fecha_nac} onChange={(v) => onPatch({ fecha_nac: v })} type="date" />
            <Field label="Lugar de nacimiento" value={fiador.lugar_nac} onChange={(v) => onPatch({ lugar_nac: v })} />
          </div>

          <SectionLabel>Datos personales</SectionLabel>
          <div className="row-2">
            <div className="field">
              <label>Estado civil</label>
              <select className="select" value={fiador.estado_civil || ''} onChange={(e) => onPatch({ estado_civil: e.target.value })}>
                <option value="">—</option>
                {ESTADOS_CIVILES_FIADOR.map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}
              </select>
            </div>
            <Field label="Profesión u oficio *" value={fiador.profesion} onChange={(v) => onPatch({ profesion: v })} />
          </div>

          {fiador.estado_civil === 'casado' && (
            <div className="row-2">
              <Field label="Nombre del cónyuge" value={fiador.conyuge_nombre} onChange={(v) => onPatch({ conyuge_nombre: v })} />
              <Field label="DPI del cónyuge" value={fiador.conyuge_dpi} onChange={(v) => onPatch({ conyuge_dpi: v })} />
            </div>
          )}

          <div className="row-2">
            <Field label="NIT" value={fiador.nit} onChange={(v) => onPatch({ nit: v })} />
            <Field label="Teléfono *" value={fiador.telefono} onChange={(v) => onPatch({ telefono: v })} />
          </div>
          <Field label="Correo electrónico" value={fiador.email} onChange={(v) => onPatch({ email: v })} type="email" />

          <SectionLabel>Domicilio</SectionLabel>
          <Field label="Domicilio completo *" value={fiador.domicilio} onChange={(v) => onPatch({ domicilio: v })} />
          <DpiScanner
            mode="recibo"
            onResult={(d) => onPatch({ domicilio: d.domicilio, recibo_path: d.recibo_path })}
            label="Comprobante de domicilio (opcional)"
            hint="El sistema extrae la dirección del recibo automáticamente."
          />

          <SectionLabel>Garantía que aporta</SectionLabel>
          <RadioGroup
            label=""
            value={fiador.tipo_garantia}
            onChange={(v) => onPatch({ tipo_garantia: v })}
            options={['personal', 'hipotecaria', 'prendaria']}
            columns={3}
            renderOption={(k) => ({ personal: 'Personal — solo fianza', hipotecaria: 'Hipotecaria — bien inmueble', prendaria: 'Prendaria — bien mueble' })[k]}
          />

          {fiador.tipo_garantia === 'hipotecaria' && (
            <div className="card" style={{ background: 'var(--gold-pale)', borderColor: 'var(--gold-border)' }}>
              <div className="card-h"><h3 style={{ fontSize: 11 }}>Datos del inmueble</h3></div>
              <div className="row-3">
                <Field label="Finca No." value={fiador.hipoteca?.finca} onChange={(v) => onPatch({ hipoteca: { ...(fiador.hipoteca || {}), finca: v } })} />
                <Field label="Folio" value={fiador.hipoteca?.folio} onChange={(v) => onPatch({ hipoteca: { ...(fiador.hipoteca || {}), folio: v } })} />
                <Field label="Libro" value={fiador.hipoteca?.libro} onChange={(v) => onPatch({ hipoteca: { ...(fiador.hipoteca || {}), libro: v } })} />
              </div>
              <div className="field">
                <label>Registro de la Propiedad</label>
                <select className="select" value={fiador.hipoteca?.registro || ''} onChange={(e) => onPatch({ hipoteca: { ...(fiador.hipoteca || {}), registro: e.target.value } })}>
                  {REGISTROS_PROPIEDAD.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <Field label="Dirección del inmueble" value={fiador.hipoteca?.direccion} onChange={(v) => onPatch({ hipoteca: { ...(fiador.hipoteca || {}), direccion: v } })} />
              <div className="row-2">
                <Field label="Área en m²" value={fiador.hipoteca?.area} onChange={(v) => onPatch({ hipoteca: { ...(fiador.hipoteca || {}), area: v } })} type="number" />
                <Field label="Valor del inmueble (Q)" value={fiador.hipoteca?.valor} onChange={(v) => onPatch({ hipoteca: { ...(fiador.hipoteca || {}), valor: v } })} type="number" />
              </div>
            </div>
          )}

          {fiador.tipo_garantia === 'prendaria' && (
            <div className="card" style={{ background: 'var(--gold-pale)', borderColor: 'var(--gold-border)' }}>
              <div className="card-h"><h3 style={{ fontSize: 11 }}>Datos del bien mueble</h3></div>
              <div className="row-2">
                <div className="field">
                  <label>Tipo de bien</label>
                  <select className="select" value={fiador.prenda?.tipo_bien || 'Vehículo'} onChange={(e) => onPatch({ prenda: { ...(fiador.prenda || {}), tipo_bien: e.target.value } })}>
                    {TIPOS_BIEN_PRENDA.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <Field label="Marca" value={fiador.prenda?.marca} onChange={(v) => onPatch({ prenda: { ...(fiador.prenda || {}), marca: v } })} />
              </div>
              <div className="row-2">
                <Field label="Modelo y año" value={fiador.prenda?.modelo} onChange={(v) => onPatch({ prenda: { ...(fiador.prenda || {}), modelo: v } })} />
                <Field label="Valor del bien (Q)" value={fiador.prenda?.valor} onChange={(v) => onPatch({ prenda: { ...(fiador.prenda || {}), valor: v } })} type="number" />
              </div>
              <div className="row-2">
                <Field label="No. de serie / chasis" value={fiador.prenda?.serie} onChange={(v) => onPatch({ prenda: { ...(fiador.prenda || {}), serie: v } })} />
                <Field label="Placa" value={fiador.prenda?.placa} onChange={(v) => onPatch({ prenda: { ...(fiador.prenda || {}), placa: v } })} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      marginTop: 14, marginBottom: 8, paddingBottom: 6,
      borderBottom: '1px solid var(--border-light)',
      fontFamily: 'DM Sans, sans-serif', fontSize: 10, fontWeight: 500,
      letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-tertiary)',
    }}>{children}</div>
  );
}

function Paso5({ slug, firmas, onChange }) {
  const [notarios, setNotarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const reload = async (selectId) => {
    setLoading(true);
    try {
      const list = await fetchNotarios(slug);
      setNotarios(list);
      if (selectId) {
        const sel = list.find((n) => n.id === selectId);
        if (sel) onChange({ notario_id: sel.id, notario: sel.nombre, colegiado: sel.colegiado || '' });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload();   }, [slug]);

  const onSelectNotario = (id) => {
    const n = notarios.find((x) => String(x.id) === String(id));
    if (n) onChange({ notario_id: n.id, notario: n.nombre, colegiado: n.colegiado || '' });
    else onChange({ notario_id: null, notario: '', colegiado: '' });
  };

  return (
    <>
      <div className="card-h"><h3>Paso 5 · Notario y firmas</h3></div>

      <div className="field">
        <label>Notario autorizante</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            className="select"
            style={{ flex: 1 }}
            value={firmas.notario_id || ''}
            onChange={(e) => onSelectNotario(e.target.value)}
          >
            <option value="">— Seleccionar notario —</option>
            {notarios.map((n) => (
              <option key={n.id} value={n.id}>
                {n.nombre}{n.colegiado ? ` · col. ${n.colegiado}` : ''}
              </option>
            ))}
          </select>
          <button className="btn btn-gold" onClick={() => setShowModal(true)} type="button">+ Nuevo notario</button>
        </div>
        {firmas.notario && (
          <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
            Autocompletado: <strong>{firmas.notario}</strong>{firmas.colegiado ? ` · colegiado ${firmas.colegiado}` : ''}
          </div>
        )}
        {!loading && notarios.length === 0 && (
          <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
            No hay notarios registrados para esta institución. Agregue uno con el botón.
          </div>
        )}
      </div>

      <div className="row-2">
        <Field label="Ciudad de autorización" value={firmas.ciudad} onChange={(v) => onChange({ ciudad: v })} />
        <Field label="Fecha de firma" value={firmas.fecha} onChange={(v) => onChange({ fecha: v })} type="date" />
      </div>
      <div className="row-2">
        <Field label="No. correlativo del contrato" value={firmas.correlativo} onChange={(v) => onChange({ correlativo: v })} placeholder="BI-2026-0001" />
        <Field label="Folio del protocolo" value={firmas.folio_protocolo} onChange={(v) => onChange({ folio_protocolo: v })} />
      </div>
      <div style={{ marginTop: 12, padding: 12, background: 'var(--gold-soft)', borderRadius: 4, fontSize: 12.5, color: 'var(--text-soft)' }}>
        Al presionar <strong>Generar contrato y PDF</strong>:<br />
        1. Se crea el contrato en la DB con número <code>{firmas.correlativo || '—'}</code>.<br />
        2. El motor compila las cláusulas y genera el PDF tamaño oficio.<br />
        3. El PDF se descarga automáticamente y te redirigimos al detalle.
      </div>

      {showModal && (
        <NotarioModal
          slug={slug}
          onClose={() => setShowModal(false)}
          onCreated={(n) => { setShowModal(false); reload(n.id); }}
        />
      )}
    </>
  );
}

function NotarioModal({ slug, onClose, onCreated }) {
  const [d, setD] = useState({ nombre: '', colegiado: '', telefono: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const upd = (p) => setD((s) => ({ ...s, ...p }));

  const submit = async () => {
    setSaving(true); setErr(null);
    try {
      const n = await createNotario(slug, d);
      onCreated(n);
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(19,20,26,0.55)',
        display: 'grid', placeItems: 'center', zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: 420, maxWidth: '90vw', background: '#fff' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-h">
          <h3>Nuevo notario</h3>
          <button className="btn-ghost btn" type="button" onClick={onClose}>Cerrar</button>
        </div>
        <Field label="Nombre completo *" value={d.nombre} onChange={(v) => upd({ nombre: v })} placeholder="Lic. Pedro Hernández García" />
        <Field label="No. colegiado" value={d.colegiado} onChange={(v) => upd({ colegiado: v })} />
        <div className="row-2">
          <Field label="Teléfono" value={d.telefono} onChange={(v) => upd({ telefono: v })} />
          <Field label="Email" value={d.email} onChange={(v) => upd({ email: v })} type="email" />
        </div>
        {err && <div className="field-error">{err}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button className="btn" type="button" onClick={onClose}>Cancelar</button>
          <button className="btn btn-gold" type="button" onClick={submit} disabled={!d.nombre || saving}>
            {saving ? <span className="spinner" /> : 'Guardar y seleccionar'}
          </button>
        </div>
      </div>
    </div>
  );
}
