import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { validarToken, enviarSolicitud, scanDpiPublico, scanReciboPublico } from '../api/solicitudes';

const STEPS = ['DPI', 'Datos personales', 'Domicilio', 'Fiadores', 'Confirmar'];

const FIADOR_VACIO = { nombre: '', dpi: '', tipo: 'personal', hipoteca: {}, prenda: {} };

export default function SolicitudPublica() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const token = params.get('token');

  const [validacion, setValidacion] = useState({ loading: true, error: null, data: null });
  const [paso, setPaso] = useState(1);
  const [d, setD] = useState({
    nombre: '', dpi: '', fecha_nac: '', lugar_nac: '',
    profesion: '', estado_civil: '', nit: '', telefono: '', email: '',
    ingresos: '', empleo: '',
    domicilio: '',
    fiadores: [],
    confirmaDatos: false, autorizaReferencias: false,
  });
  const [enviando, setEnviando] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);

  const upd = (p) => setD((s) => ({ ...s, ...p }));

  useEffect(() => {
    if (!token) { setValidacion({ loading: false, error: 'Falta el token en el link.', data: null }); return; }
    validarToken(slug, token)
      .then((r) => setValidacion({ loading: false, error: null, data: r }))
      .catch((e) => setValidacion({ loading: false, error: e.response?.data?.error || e.message, data: null }));
  }, [slug, token]);

  const onScanDpi = async (file) => {
    const r = await scanDpiPublico(file);
    upd({ nombre: r.nombre, dpi: r.dpi, fecha_nac: r.fecha_nac, lugar_nac: r.lugar_nac });
  };
  const onScanRecibo = async (file) => {
    const r = await scanReciboPublico(file);
    upd({ domicilio: r.domicilio });
  };

  const enviar = async () => {
    setEnviando(true); setError(null);
    try {
      const r = await enviarSolicitud(slug, token, d);
      setDone(r);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setEnviando(false);
    }
  };

  if (validacion.loading) return <Pantalla><Centro><span className="spinner" /></Centro></Pantalla>;
  if (validacion.error) return <Pantalla><Centro><h2 style={{ color: 'var(--danger)' }}>Link no válido</h2><p>{validacion.error}</p></Centro></Pantalla>;
  if (done) return (
    <Pantalla>
      <Centro>
        <div style={{ width: 64, height: 64, borderRadius: '50%', border: '2px solid var(--success)', margin: '0 auto 12px', display: 'grid', placeItems: 'center' }}>
          <div style={{ width: 22, height: 12, borderLeft: '2px solid var(--success)', borderBottom: '2px solid var(--success)', transform: 'rotate(-45deg) translateY(-3px)' }} />
        </div>
        <h2>Solicitud recibida</h2>
        <p>Tu solicitud fue recibida correctamente.</p>
        <p style={{ fontSize: 14, color: 'var(--text-dim)' }}>Número de solicitud: <strong>{done.solicitud_no}</strong></p>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 18 }}>
          El abogado de <strong>{validacion.data.institucion.nombre}</strong> revisará tu solicitud y se pondrá en contacto contigo.
        </p>
      </Centro>
    </Pantalla>
  );

  return (
    <Pantalla>
      <header style={{ padding: '20px 32px', background: '#fff', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, background: 'var(--gold)', color: 'var(--sidebar)', borderRadius: 8, display: 'grid', placeItems: 'center', fontFamily: 'Cormorant Garamond, serif', fontWeight: 700, fontSize: 22 }}>L</div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1 }}>Solicitud de crédito</div>
            <div style={{ fontWeight: 600 }}>{validacion.data.institucion.nombre}</div>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: '24px auto', padding: '0 20px' }}>
        <div className="wizard-steps">
          {STEPS.map((s, i) => (
            <div key={i} className={'wizard-step' + (i + 1 === paso ? ' active' : i + 1 < paso ? ' done' : '')}>
              <span className="num">{i + 1}.</span>{s}
            </div>
          ))}
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          {paso === 1 && <Paso1 d={d} upd={upd} onScan={onScanDpi} />}
          {paso === 2 && <Paso2 d={d} upd={upd} />}
          {paso === 3 && <Paso3 d={d} upd={upd} onScan={onScanRecibo} />}
          {paso === 4 && <Paso4 d={d} upd={upd} />}
          {paso === 5 && <Paso5 d={d} upd={upd} enviar={enviar} enviando={enviando} error={error} />}

          {paso < 5 && (
            <div className="wizard-actions">
              <button className="btn" disabled={paso === 1} onClick={() => setPaso(paso - 1)}>← Anterior</button>
              <button className="btn btn-gold" onClick={() => setPaso(paso + 1)}>Siguiente →</button>
            </div>
          )}
          {paso === 5 && (
            <div className="wizard-actions">
              <button className="btn" onClick={() => setPaso(paso - 1)}>← Anterior</button>
            </div>
          )}
        </div>
      </main>
    </Pantalla>
  );
}

function Pantalla({ children }) {
  return <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>{children}</div>;
}
function Centro({ children }) {
  return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 20 }}><div style={{ maxWidth: 480 }}>{children}</div></div>;
}
function ScanZone({ label, onFile }) {
  return (
    <label className="scanner" style={{ display: 'block' }}>
      <div className="ico">DPI</div>
      <div className="lbl">{label}</div>
      <div className="hint">Toque para tomar o subir foto</div>
      <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
    </label>
  );
}

function Paso1({ d, upd, onScan }) {
  return (
    <>
      <h3>Paso 1 · Cargue la foto de su DPI</h3>
      <p className="muted">Necesitamos extraer sus datos personales del DPI. Cargue una foto clara de ambos lados.</p>
      <ScanZone label="Cargar foto del DPI" onFile={onScan} />
      <div className="row-2" style={{ marginTop: 14 }}>
        <div className="field"><label>Nombre completo</label><input className="input" value={d.nombre} onChange={(e) => upd({ nombre: e.target.value })} /></div>
        <div className="field"><label>CUI / DPI</label><input className="input" value={d.dpi} onChange={(e) => upd({ dpi: e.target.value })} /></div>
      </div>
      <div className="row-2">
        <div className="field"><label>Fecha de nacimiento</label><input className="input" type="date" value={d.fecha_nac} onChange={(e) => upd({ fecha_nac: e.target.value })} /></div>
        <div className="field"><label>Lugar de nacimiento</label><input className="input" value={d.lugar_nac} onChange={(e) => upd({ lugar_nac: e.target.value })} /></div>
      </div>
    </>
  );
}

function Paso2({ d, upd }) {
  return (
    <>
      <h3>Paso 2 · Datos personales</h3>
      <div className="row-2">
        <div className="field"><label>Profesión</label><input className="input" value={d.profesion} onChange={(e) => upd({ profesion: e.target.value })} /></div>
        <div className="field">
          <label>Estado civil</label>
          <select className="select" value={d.estado_civil} onChange={(e) => upd({ estado_civil: e.target.value })}>
            <option value="">—</option>
            <option value="soltero">Soltero/a</option>
            <option value="casado">Casado/a</option>
            <option value="union de hecho">Unión de hecho</option>
            <option value="divorciado">Divorciado/a</option>
            <option value="viudo">Viudo/a</option>
          </select>
        </div>
      </div>
      <div className="row-2">
        <div className="field"><label>NIT</label><input className="input" value={d.nit} onChange={(e) => upd({ nit: e.target.value })} /></div>
        <div className="field"><label>Teléfono</label><input className="input" value={d.telefono} onChange={(e) => upd({ telefono: e.target.value })} /></div>
      </div>
      <div className="row-2">
        <div className="field"><label>Correo electrónico</label><input className="input" type="email" value={d.email} onChange={(e) => upd({ email: e.target.value })} /></div>
        <div className="field"><label>Ingresos mensuales (Q)</label><input className="input" type="number" value={d.ingresos} onChange={(e) => upd({ ingresos: e.target.value })} /></div>
      </div>
      <div className="field"><label>Empleo actual</label><input className="input" value={d.empleo} onChange={(e) => upd({ empleo: e.target.value })} placeholder="Nombre del patrono o tu negocio" /></div>
    </>
  );
}

function Paso3({ d, upd, onScan }) {
  return (
    <>
      <h3>Paso 3 · Comprobante de domicilio</h3>
      <p className="muted">Cargue una foto de un recibo reciente (luz, agua, teléfono) para verificar su dirección.</p>
      <ScanZone label="Cargar foto de recibo" onFile={onScan} />
      <div className="field" style={{ marginTop: 14 }}>
        <label>Domicilio</label>
        <input className="input" value={d.domicilio} onChange={(e) => upd({ domicilio: e.target.value })} placeholder="Dirección completa" />
      </div>
    </>
  );
}

function Paso4({ d, upd }) {
  const setF = (i, p) => {
    const fs = [...d.fiadores];
    fs[i] = { ...fs[i], ...p };
    upd({ fiadores: fs });
  };
  const add = () => upd({ fiadores: [...d.fiadores, { ...FIADOR_VACIO }] });
  const remove = (i) => upd({ fiadores: d.fiadores.filter((_, idx) => idx !== i) });

  return (
    <>
      <h3>Paso 4 · Fiadores (opcional)</h3>
      <p className="muted">Si vas a presentar fiadores, cargá sus datos. Podés agregar varios.</p>
      {d.fiadores.map((f, i) => (
        <div key={i} className="card" style={{ background: 'var(--gold-soft)', borderColor: 'var(--gold-border)', marginBottom: 10 }}>
          <div className="card-h">
            <h3 style={{ fontSize: 13 }}>Fiador {i + 1}</h3>
            <button className="btn btn-danger" onClick={() => remove(i)}>×</button>
          </div>
          <div className="row-2">
            <div className="field"><label>Nombre</label><input className="input" value={f.nombre} onChange={(e) => setF(i, { nombre: e.target.value })} /></div>
            <div className="field"><label>DPI</label><input className="input" value={f.dpi} onChange={(e) => setF(i, { dpi: e.target.value })} /></div>
          </div>
          <div className="field">
            <label>Tipo de garantía</label>
            <select className="select" value={f.tipo} onChange={(e) => setF(i, { tipo: e.target.value })}>
              <option value="personal">Personal (sólo fianza)</option>
              <option value="hipotecaria">Hipotecaria</option>
              <option value="prendaria">Prendaria</option>
            </select>
          </div>
          {f.tipo === 'hipotecaria' && (
            <div className="row-3">
              <div className="field"><label>Finca</label><input className="input" value={f.hipoteca?.finca || ''} onChange={(e) => setF(i, { hipoteca: { ...(f.hipoteca || {}), finca: e.target.value } })} /></div>
              <div className="field"><label>Folio</label><input className="input" value={f.hipoteca?.folio || ''} onChange={(e) => setF(i, { hipoteca: { ...(f.hipoteca || {}), folio: e.target.value } })} /></div>
              <div className="field"><label>Libro</label><input className="input" value={f.hipoteca?.libro || ''} onChange={(e) => setF(i, { hipoteca: { ...(f.hipoteca || {}), libro: e.target.value } })} /></div>
            </div>
          )}
          {f.tipo === 'prendaria' && (
            <div className="row-2">
              <div className="field"><label>Tipo de bien</label><input className="input" value={f.prenda?.tipo || ''} onChange={(e) => setF(i, { prenda: { ...(f.prenda || {}), tipo: e.target.value } })} /></div>
              <div className="field"><label>Marca</label><input className="input" value={f.prenda?.marca || ''} onChange={(e) => setF(i, { prenda: { ...(f.prenda || {}), marca: e.target.value } })} /></div>
              <div className="field"><label>Serie</label><input className="input" value={f.prenda?.serie || ''} onChange={(e) => setF(i, { prenda: { ...(f.prenda || {}), serie: e.target.value } })} /></div>
              <div className="field"><label>Placa</label><input className="input" value={f.prenda?.placa || ''} onChange={(e) => setF(i, { prenda: { ...(f.prenda || {}), placa: e.target.value } })} /></div>
            </div>
          )}
        </div>
      ))}
      <button className="btn btn-gold" onClick={add}>+ Agregar fiador</button>
    </>
  );
}

function Paso5({ d, upd, enviar, enviando, error }) {
  return (
    <>
      <h3>Paso 5 · Resumen y confirmación</h3>
      <div className="card" style={{ background: '#faf9f4', marginBottom: 12 }}>
        <h3 style={{ marginTop: 0, fontSize: 13 }}>Tus datos</h3>
        <dl className="kv">
          <dt>Nombre</dt><dd>{d.nombre || '—'}</dd>
          <dt>DPI</dt><dd>{d.dpi || '—'}</dd>
          <dt>NIT</dt><dd>{d.nit || '—'}</dd>
          <dt>Profesión</dt><dd>{d.profesion || '—'}</dd>
          <dt>Estado civil</dt><dd>{d.estado_civil || '—'}</dd>
          <dt>Domicilio</dt><dd>{d.domicilio || '—'}</dd>
          <dt>Teléfono</dt><dd>{d.telefono || '—'}</dd>
          <dt>Email</dt><dd>{d.email || '—'}</dd>
          <dt>Ingresos</dt><dd>{d.ingresos ? `Q${d.ingresos}` : '—'}</dd>
          <dt>Empleo</dt><dd>{d.empleo || '—'}</dd>
          <dt>Fiadores</dt><dd>{d.fiadores.length}</dd>
        </dl>
      </div>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
        <input type="checkbox" checked={d.confirmaDatos} onChange={(e) => upd({ confirmaDatos: e.target.checked })} style={{ accentColor: 'var(--gold)', marginTop: 3 }} />
        <span>Confirmo que los datos proporcionados son verídicos.</span>
      </label>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 14 }}>
        <input type="checkbox" checked={d.autorizaReferencias} onChange={(e) => upd({ autorizaReferencias: e.target.checked })} style={{ accentColor: 'var(--gold)', marginTop: 3 }} />
        <span>Autorizo la verificación de mis referencias laborales, personales y crediticias.</span>
      </label>

      {error && <div className="alert alert-danger">{error}</div>}

      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <button
          className="btn btn-gold"
          style={{ padding: '12px 32px', fontSize: 14 }}
          disabled={!d.confirmaDatos || !d.autorizaReferencias || !d.nombre || !d.dpi || enviando}
          onClick={enviar}
        >
          {enviando ? <span className="spinner" /> : 'ENVIAR SOLICITUD'}
        </button>
      </div>
    </>
  );
}
