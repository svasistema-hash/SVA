import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import Topbar from '../../components/Topbar';
import Breadcrumb from '../../components/Breadcrumb';
import { tenantBreadcrumb } from '../../utils/breadcrumb';
import { scanDpi, scanRecibo } from '../../api/contratos';
import { createCliente } from '../../api/clientes';
import { useStore } from '../../store/useStore';

const STEPS = [
  { n: 1, label: 'DPI' },
  { n: 2, label: 'Domicilio' },
  { n: 3, label: 'Datos' },
  { n: 4, label: 'Confirmar' },
];

const ESTADOS_CIVILES = [
  { v: 'soltero', l: 'Soltero/a' },
  { v: 'casado', l: 'Casado/a' },
  { v: 'divorciado', l: 'Divorciado/a' },
  { v: 'viudo', l: 'Viudo/a' },
  { v: 'union de hecho', l: 'Unido/a de hecho' },
];

const RANGOS_INGRESOS = [
  'Menos de Q3,000',
  'Q3,000 - Q5,000',
  'Q5,000 - Q10,000',
  'Q10,000 - Q20,000',
  'Q20,000 - Q50,000',
  'Más de Q50,000',
];

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
function fechaLarga(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso || '';
  const [y, m, d] = iso.split('-');
  return `${parseInt(d, 10)} de ${MESES[parseInt(m, 10) - 1]} de ${y}`;
}

function ExtractedRow({ label, value, onChange, displayFn }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="row">
      <div className="label">{label}</div>
      {editing ? (
        <input className="input" value={value || ''} onChange={(e) => onChange(e.target.value)} onBlur={() => setEditing(false)} autoFocus />
      ) : (
        <div className={'valor' + (!value ? ' empty' : '')}>
          {value ? (displayFn ? displayFn(value) : value) : '—'}
        </div>
      )}
      {!editing && (
        <button className="corregir" type="button" onClick={() => setEditing(true)}>Corregir</button>
      )}
    </div>
  );
}

function ScanZone({ label, hint, scanning, onFile, completado }) {
  return (
    <label className={'scanner-grande' + (scanning ? ' scanning' : '') + (completado ? ' has-file' : '')}>
      <div className="ico-grande">{scanning ? '...' : completado ? 'OK' : 'DOC'}</div>
      <div className="lbl-grande">{label}</div>
      <div className="hint-grande">{hint}</div>
      {scanning && <div className="scan-progress">Escaneando documento…</div>}
      {!scanning && <div className="muted" style={{ fontSize: 11 }}>Acepta JPG, PNG · click para cargar</div>}
      <input
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
    </label>
  );
}

export default function ClienteNuevo() {
  const { inst } = useOutletContext() || {};
  const nav = useNavigate();
  const iniciarContrato = useStore((s) => s.iniciarContrato);
  const cargarCliente = useStore((s) => s.cargarCliente);

  const [paso, setPaso] = useState(1);
  const [scanning, setScanning] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);
  const [d, setD] = useState({
    nombre: '', dpi: '', fecha_nac: '', lugar_nac: '', genero: '',
    dpi_scan_path: '',
    domicilio: '', comprobante: '', recibo_path: '',
    estado_civil: '', conyuge_nombre: '', conyuge_dpi: '',
    profesion: '', nit: '', telefono: '', email: '',
    ingresos_rango: '', empleo: '',
  });

  const upd = (patch) => setD((s) => ({ ...s, ...patch }));

  if (!inst) return (<><Topbar title="Cargando…" /><div className="app-content"><div className="empty"><span className="spinner" /></div></div></>);

  const onScanDpi = async (file) => {
    setScanning('dpi'); setError(null);
    try {
      await new Promise((r) => setTimeout(r, 900));
      const r = await scanDpi(file);
      upd({ nombre: r.nombre, dpi: r.dpi, fecha_nac: r.fecha_nac, lugar_nac: r.lugar_nac, genero: r.genero || '', dpi_scan_path: r.dpi_scan_path });
    } catch (e) {
      setError('Error al escanear DPI: ' + (e.response?.data?.error || e.message));
    } finally {
      setScanning(null);
    }
  };

  const onScanRecibo = async (file) => {
    setScanning('recibo'); setError(null);
    try {
      await new Promise((r) => setTimeout(r, 900));
      const r = await scanRecibo(file);
      upd({ domicilio: r.domicilio, comprobante: r.comprobante || '', recibo_path: r.recibo_path });
    } catch (e) {
      setError('Error al escanear recibo: ' + (e.response?.data?.error || e.message));
    } finally {
      setScanning(null);
    }
  };

  const reescanearDpi = () => upd({ nombre: '', dpi: '', fecha_nac: '', lugar_nac: '', genero: '', dpi_scan_path: '' });
  const reescanearRecibo = () => upd({ domicilio: '', comprobante: '', recibo_path: '' });

  const dpiHecho = d.nombre && d.dpi;
  const reciboHecho = !!d.domicilio;
  const datosCompletos = d.estado_civil && d.profesion && d.telefono && d.ingresos_rango && (d.estado_civil !== 'casado' || (d.conyuge_nombre && d.conyuge_dpi));

  const guardar = async () => {
    setSaving(true); setError(null);
    try {
      const cliente = await createCliente({
        institucion_id: inst.id,
        nombre: d.nombre, dpi: d.dpi, fecha_nac: d.fecha_nac, lugar_nac: d.lugar_nac, genero: d.genero,
        dpi_scan_path: d.dpi_scan_path,
        domicilio: d.domicilio, recibo_path: d.recibo_path,
        estado_civil: d.estado_civil, conyuge_nombre: d.conyuge_nombre, conyuge_dpi: d.conyuge_dpi,
        profesion: d.profesion, nit: d.nit, telefono: d.telefono, email: d.email,
        ingresos_rango: d.ingresos_rango, empleo: d.empleo,
        estado: 'activo',
      });
      setSaved(cliente);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  const crearContrato = () => {
    const modelo = inst.modelos?.[0];
    if (!modelo) return;
    iniciarContrato({
      institucion_id: inst.id,
      institucion_slug: inst.slug,
      modelo_id: modelo.id,
      modelo_codigos: modelo.clausulas || [],
    });
    cargarCliente(saved);
    nav(`/instituciones/${inst.slug}/contratos/nuevo`);
  };

  const reiniciar = () => {
    setSaved(null);
    setPaso(1);
    setD({
      nombre: '', dpi: '', fecha_nac: '', lugar_nac: '', genero: '',
      dpi_scan_path: '',
      domicilio: '', comprobante: '', recibo_path: '',
      estado_civil: '', conyuge_nombre: '', conyuge_dpi: '',
      profesion: '', nit: '', telefono: '', email: '',
      ingresos_rango: '', empleo: '',
    });
  };

  if (saved) {
    return (
      <>
        <Topbar title="Cliente guardado" crumbs={inst.nombre} />
        <div className="app-content">
          <div style={{ maxWidth: 520, margin: '40px auto', textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', border: '2px solid var(--success)', margin: '0 auto 16px', display: 'grid', placeItems: 'center' }}>
              <div style={{ width: 22, height: 12, borderLeft: '2px solid var(--success)', borderBottom: '2px solid var(--success)', transform: 'rotate(-45deg) translateY(-3px)' }} />
            </div>
            <h2 style={{ marginTop: 6 }}>Cliente guardado exitosamente</h2>
            <p className="muted" style={{ fontSize: 13 }}>
              <strong>{saved.nombre}</strong> ya está disponible en el buscador del wizard de contratos.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 22 }}>
              <button className="btn btn-gold" style={{ padding: '12px 16px' }} onClick={crearContrato}>
                Crear contrato para este cliente →
              </button>
              <button className="btn" onClick={reiniciar}>Agregar otro cliente</button>
              <button className="btn btn-ghost" onClick={() => nav('..')}>Volver a clientes</button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar
        title="Nuevo cliente"
        crumbs={<Breadcrumb segments={[...tenantBreadcrumb(inst), { label: 'Clientes', to: `/instituciones/${inst.slug}/clientes` }, { label: 'Nuevo' }]} />}
        actions={<button className="btn" onClick={() => nav('..')}>Cancelar</button>}
      />
      <div className="app-content">
        <div className="wizard-steps">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className={'wizard-step' + (s.n === paso ? ' active' : s.n < paso ? ' done' : '')}
              onClick={() => setPaso(s.n)}
            >
              <span className="num">{s.n}.</span>{s.label}
            </div>
          ))}
        </div>

        {error && <div className="alert alert-danger" style={{ marginTop: 12 }}>{error}</div>}

        <div style={{ maxWidth: 760, margin: '14px auto 0' }}>
          {paso === 1 && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Paso 1 · Escanear DPI</h3>
              {!dpiHecho ? (
                <ScanZone
                  label="Fotografíe o cargue el DPI del cliente"
                  hint="El sistema extrae los datos automáticamente. Use la cámara desde su celular o cargue una imagen."
                  scanning={scanning === 'dpi'}
                  onFile={onScanDpi}
                />
              ) : (
                <div className="extracted-card">
                  <div className="head">
                    <h4>Datos extraídos del DPI</h4>
                    <div className="acciones">
                      <button className="btn btn-sm" onClick={reescanearDpi}>Re-escanear</button>
                    </div>
                  </div>
                  <ExtractedRow label="Nombre" value={d.nombre} onChange={(v) => upd({ nombre: v })} />
                  <ExtractedRow label="CUI / DPI" value={d.dpi} onChange={(v) => upd({ dpi: v })} />
                  <ExtractedRow label="Fecha nac." value={d.fecha_nac} onChange={(v) => upd({ fecha_nac: v })} displayFn={fechaLarga} />
                  <ExtractedRow label="Lugar nac." value={d.lugar_nac} onChange={(v) => upd({ lugar_nac: v })} />
                  <ExtractedRow label="Género" value={d.genero} onChange={(v) => upd({ genero: v })} />
                </div>
              )}
              <div className="wizard-actions">
                <button className="btn" disabled>← Anterior</button>
                <button className="btn btn-gold" onClick={() => setPaso(2)} disabled={!dpiHecho}>Siguiente →</button>
              </div>
            </div>
          )}

          {paso === 2 && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Paso 2 · Escanear recibo de luz, agua o teléfono</h3>
              {!reciboHecho ? (
                <ScanZone
                  label="Cargue factura de luz, agua o teléfono"
                  hint="Se extrae el domicilio del cliente automáticamente."
                  scanning={scanning === 'recibo'}
                  onFile={onScanRecibo}
                />
              ) : (
                <div className="extracted-card">
                  <div className="head">
                    <h4>Domicilio extraído del comprobante</h4>
                    <div className="acciones">
                      <button className="btn btn-sm" onClick={reescanearRecibo}>Re-escanear</button>
                    </div>
                  </div>
                  <ExtractedRow label="Dirección" value={d.domicilio} onChange={(v) => upd({ domicilio: v })} />
                  <ExtractedRow label="Comprobante" value={d.comprobante} onChange={(v) => upd({ comprobante: v })} />
                </div>
              )}
              <div className="wizard-actions">
                <button className="btn" onClick={() => setPaso(1)}>← Anterior</button>
                <button className="btn btn-gold" onClick={() => setPaso(3)} disabled={!reciboHecho}>Siguiente →</button>
              </div>
            </div>
          )}

          {paso === 3 && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Paso 3 · Datos complementarios</h3>
              <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
                Estos son los datos que no vienen en el DPI ni en el recibo. Fondo blanco indica entrada manual.
              </p>

              <div className="field">
                <label>Estado civil *</label>
                <select className="select" value={d.estado_civil} onChange={(e) => upd({ estado_civil: e.target.value })}>
                  <option value="">— Seleccionar —</option>
                  {ESTADOS_CIVILES.map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}
                </select>
              </div>

              {d.estado_civil === 'casado' && (
                <div className="card" style={{ background: '#faf9f4', borderColor: 'var(--border-strong)' }}>
                  <div className="card-h"><h3 style={{ fontSize: 13 }}>Datos del cónyuge</h3></div>
                  <div className="row-2">
                    <div className="field">
                      <label>Nombre del cónyuge</label>
                      <input className="input" value={d.conyuge_nombre} onChange={(e) => upd({ conyuge_nombre: e.target.value })} placeholder="María López de Pérez" />
                    </div>
                    <div className="field">
                      <label>DPI del cónyuge</label>
                      <input className="input" value={d.conyuge_dpi} onChange={(e) => upd({ conyuge_dpi: e.target.value })} />
                    </div>
                  </div>
                </div>
              )}

              <div className="row-2">
                <div className="field">
                  <label>Profesión u oficio *</label>
                  <input className="input" value={d.profesion} onChange={(e) => upd({ profesion: e.target.value })} placeholder="Ingeniero civil" />
                </div>
                <div className="field">
                  <label>NIT</label>
                  <input className="input" value={d.nit} onChange={(e) => upd({ nit: e.target.value })} />
                </div>
              </div>

              <div className="row-2">
                <div className="field">
                  <label>Teléfono *</label>
                  <input className="input" value={d.telefono} onChange={(e) => upd({ telefono: e.target.value })} placeholder="+502 5555-1234" />
                </div>
                <div className="field">
                  <label>Correo electrónico</label>
                  <input className="input" type="email" value={d.email} onChange={(e) => upd({ email: e.target.value })} />
                </div>
              </div>

              <div className="row-2">
                <div className="field">
                  <label>Ingresos mensuales *</label>
                  <select className="select" value={d.ingresos_rango} onChange={(e) => upd({ ingresos_rango: e.target.value })}>
                    <option value="">— Seleccionar rango —</option>
                    {RANGOS_INGRESOS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Empleo actual</label>
                  <input className="input" value={d.empleo} onChange={(e) => upd({ empleo: e.target.value })} placeholder="Constructora XYZ, S.A." />
                </div>
              </div>

              <div className="wizard-actions">
                <button className="btn" onClick={() => setPaso(2)}>← Anterior</button>
                <button className="btn btn-gold" onClick={() => setPaso(4)} disabled={!datosCompletos}>Siguiente →</button>
              </div>
            </div>
          )}

          {paso === 4 && (
            <div>
              <div className="card" style={{ marginBottom: 14 }}>
                <h3 style={{ marginTop: 0 }}>Paso 4 · Revisión final</h3>
                <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
                  Verifique que todo esté correcto. Use el botón "Editar sección" para corregir cualquier bloque.
                </p>
              </div>

              <SeccionResumen titulo="Identificación" onEdit={() => setPaso(1)}>
                <KV label="Nombre" value={d.nombre} />
                <KV label="DPI" value={d.dpi} />
                <KV label="Fecha nac." value={fechaLarga(d.fecha_nac) + (d.lugar_nac ? ' · ' + d.lugar_nac : '')} />
                <KV label="Género" value={d.genero} />
              </SeccionResumen>

              <SeccionResumen titulo="Datos personales" onEdit={() => setPaso(3)}>
                <KV label="Estado civil" value={ESTADOS_CIVILES.find((x) => x.v === d.estado_civil)?.l || d.estado_civil} />
                {d.estado_civil === 'casado' && (
                  <>
                    <KV label="Cónyuge" value={d.conyuge_nombre} />
                    <KV label="DPI cónyuge" value={d.conyuge_dpi} />
                  </>
                )}
                <KV label="Profesión" value={d.profesion} />
                <KV label="NIT" value={d.nit} />
              </SeccionResumen>

              <SeccionResumen titulo="Contacto y domicilio" onEdit={() => setPaso(2)}>
                <KV label="Teléfono" value={d.telefono} />
                <KV label="Email" value={d.email} />
                <KV label="Domicilio" value={d.domicilio} />
                <KV label="Comprobante" value={d.comprobante} />
              </SeccionResumen>

              <SeccionResumen titulo="Financiero" onEdit={() => setPaso(3)}>
                <KV label="Ingresos" value={d.ingresos_rango} />
                <KV label="Empleo" value={d.empleo} />
              </SeccionResumen>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
                <button className="btn" onClick={() => setPaso(3)}>← Anterior</button>
                <button className="btn btn-gold" style={{ padding: '10px 20px', fontSize: 14 }} onClick={guardar} disabled={saving}>
                  {saving ? <span className="spinner" /> : 'Guardar cliente'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function SeccionResumen({ titulo, onEdit, children }) {
  return (
    <div className="resumen-card">
      <div className="head">
        <h4>{titulo}</h4>
        <button className="btn btn-sm" onClick={onEdit}>Editar sección</button>
      </div>
      <div className="body">
        <dl className="kv">{children}</dl>
      </div>
    </div>
  );
}

function KV({ label, value }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value || <span className="muted">—</span>}</dd>
    </>
  );
}
