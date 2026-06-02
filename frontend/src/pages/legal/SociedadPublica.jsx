// Portal público del cliente — sin login, con token de 7 días.
// El cliente llena accionistas, representantes y direcciones.

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  publicFetchSociedad, publicCreateAccionista, publicDeleteAccionista,
  publicCreateRepresentante, publicDeleteRepresentante,
  publicCreateDireccion, publicDeleteDireccion,
  publicConfirmar, CARGOS_REPRESENTANTE, TIPOS_DIRECCION,
} from '../../api/legal';

export default function SociedadPublica() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const recargar = async () => {
    try {
      const r = await publicFetchSociedad(token);
      setData(r);
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo cargar el enlace.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { recargar(); }, [token]);

  const sumaPorcentajes = (data?.accionistas || []).reduce((s, a) => s + Number(a.porcentaje || 0), 0);
  const sumaAcciones = (data?.accionistas || []).reduce((s, a) => s + Number(a.acciones_cantidad || 0), 0);
  const totalEsperado = Number(data?.sociedad?.total_acciones || 0);
  const completo = data &&
    data.accionistas?.length >= 1 &&
    Math.abs(sumaPorcentajes - 100) < 0.01 &&
    sumaAcciones === totalEsperado &&
    data.representantes?.length >= 1 &&
    data.direcciones?.some((d) => d.tipo === 'fiscal');

  if (loading) return <Pantalla><Spinner /></Pantalla>;
  if (error) return <Pantalla><PantallaError mensaje={error} /></Pantalla>;
  if (done) return <Pantalla><PantallaExito sociedad={data?.sociedad} /></Pantalla>;

  return (
    <Pantalla>
      <Encabezado sociedad={data.sociedad} iteracion={data.iteracion} expiresAt={data.expires_at} />

      {data.correcciones_pendientes?.length > 0 && (
        <CorreccionesPendientes correcciones={data.correcciones_pendientes} />
      )}

      <Seccion titulo="Accionistas" subtitulo={`La suma de porcentajes debe ser 100% (actual: ${sumaPorcentajes}%). Las acciones deben sumar ${totalEsperado} (actual: ${sumaAcciones}).`}>
        <ListaAccionistas accionistas={data.accionistas} token={token} onChange={recargar} />
        {!data.sociedad.estado.includes('correcciones') && !['en_curso','correcciones_cliente'].includes(data.sociedad.estado) ? null :
          <FormAccionista token={token} onAdded={recargar} totalAcciones={totalEsperado} sumaActual={sumaPorcentajes} />}
      </Seccion>

      <Seccion titulo="Representantes legales" subtitulo="Al menos un representante con cargo válido es requerido.">
        <ListaRepresentantes representantes={data.representantes} token={token} onChange={recargar} />
        <FormRepresentante token={token} onAdded={recargar} />
      </Seccion>

      <Seccion titulo="Direcciones" subtitulo="La dirección fiscal es obligatoria. Las direcciones comercial y de notificaciones son opcionales.">
        <ListaDirecciones direcciones={data.direcciones} token={token} onChange={recargar} />
        <FormDireccion token={token} onAdded={recargar} existentes={data.direcciones?.map((d) => d.tipo) || []} />
      </Seccion>

      <div style={{ position: 'sticky', bottom: 0, padding: 16, background: '#fff', borderTop: '0.5px solid var(--border)', marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          {completo
            ? 'Toda la información requerida está completa. Puede enviar para revisión profesional.'
            : 'Complete todos los datos requeridos antes de enviar.'}
        </div>
        <button
          className="btn btn-gold"
          disabled={!completo}
          onClick={async () => {
            if (!confirm('¿Confirma el envío de los datos para revisión profesional?')) return;
            try {
              await publicConfirmar(token);
              setDone(true);
            } catch (e) {
              alert(e.response?.data?.error || 'Error al confirmar.');
            }
          }}
        >Enviar para revisión</button>
      </div>
    </Pantalla>
  );
}

// ──────────────────────────────────────────────────────────────
// Layout
// ──────────────────────────────────────────────────────────────

function Pantalla({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f8f5ec', padding: '24px 16px' }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>{children}</div>
    </div>
  );
}

function Spinner() {
  return <div style={{ textAlign: 'center', padding: 80 }}><span className="spinner" /></div>;
}

function PantallaError({ mensaje }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: 40 }}>
      <h2 style={{ marginBottom: 8 }}>Enlace no válido</h2>
      <p className="muted">{mensaje}</p>
      <p className="muted" style={{ fontSize: 12 }}>
        Si recibió este enlace recientemente y no le funciona, comuníquese con el bufete que lo emitió.
      </p>
    </div>
  );
}

function PantallaExito({ sociedad }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: 40 }}>
      <h2 style={{ marginBottom: 8, color: 'var(--gold)' }}>Datos enviados correctamente</h2>
      <p>El abogado revisará los datos suministrados y se comunicará con usted en caso de requerir alguna corrección.</p>
      <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
        Caso: {sociedad?.denominacion}
      </p>
    </div>
  );
}

function Encabezado({ sociedad, iteracion, expiresAt }) {
  const dias = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (24 * 3600 * 1000)));
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h2 style={{ marginTop: 0, color: 'var(--gold)' }}>Constitución de Sociedad Anónima</h2>
      <p style={{ marginTop: 0, fontSize: 13 }}>
        Bienvenido. A continuación complete los datos requeridos para la constitución de la sociedad
        <strong> {sociedad.denominacion}, Sociedad Anónima</strong>.
      </p>
      <div className="muted" style={{ fontSize: 11 }}>
        Iteración: {iteracion} · Este enlace caduca el {new Date(expiresAt).toLocaleDateString('es')} ({dias} días restantes)
      </div>
    </div>
  );
}

function CorreccionesPendientes({ correcciones }) {
  return (
    <div className="alert alert-warn" style={{ marginBottom: 14 }}>
      <strong>El abogado solicitó correcciones</strong>
      {correcciones.map((c) => (
        <div key={c.id} style={{ marginTop: 8, fontSize: 13 }}>
          <div><strong>Iteración {c.iteracion}:</strong> {c.comentario}</div>
          <div className="muted" style={{ fontSize: 11 }}>
            Campos: {(Array.isArray(c.campos_a_corregir) ? c.campos_a_corregir : (() => { try { return JSON.parse(c.campos_a_corregir); } catch { return []; } })()).join(', ')}
          </div>
        </div>
      ))}
    </div>
  );
}

function Seccion({ titulo, subtitulo, children }) {
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-h"><h3>{titulo}</h3></div>
      {subtitulo && <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>{subtitulo}</p>}
      <div>{children}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Accionistas
// ──────────────────────────────────────────────────────────────

function ListaAccionistas({ accionistas, token, onChange }) {
  if (!accionistas || accionistas.length === 0) {
    return <div className="muted" style={{ fontSize: 12.5, padding: '8px 0' }}>Aún no agregó accionistas.</div>;
  }
  return (
    <table className="table-light" style={{ width: '100%', fontSize: 13 }}>
      <thead>
        <tr style={{ textAlign: 'left', color: 'var(--text-dim)', fontSize: 11 }}>
          <th>Nombre</th><th>DPI/NIT</th><th>Acciones</th><th>%</th><th />
        </tr>
      </thead>
      <tbody>
        {accionistas.map((a) => (
          <tr key={a.id} style={{ borderTop: '0.5px solid var(--border)' }}>
            <td style={{ padding: '6px 0' }}>{a.nombre}</td>
            <td className="muted">{a.dpi_o_nit}</td>
            <td>{a.acciones_cantidad}</td>
            <td>{a.porcentaje}%</td>
            <td style={{ textAlign: 'right' }}>
              <button className="btn btn-sm btn-ghost" onClick={async () => {
                if (!confirm('¿Eliminar este accionista?')) return;
                await publicDeleteAccionista(token, a.id);
                onChange();
              }}>Quitar</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FormAccionista({ token, onAdded, totalAcciones, sumaActual }) {
  const [d, setD] = useState({
    tipo_persona: 'individual', nombre: '', dpi_o_nit: '',
    fecha_nac: '', genero: 'M', estado_civil: '', profesion: '', domicilio: '',
    acciones_cantidad: '', porcentaje: '',
  });
  const [err, setErr] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const valid = d.nombre && d.dpi_o_nit && d.acciones_cantidad && d.porcentaje;

  const submit = async () => {
    if (!valid) return;
    setGuardando(true); setErr(null);
    try {
      await publicCreateAccionista(token, d);
      setD({ ...d, nombre: '', dpi_o_nit: '', acciones_cantidad: '', porcentaje: '', fecha_nac: '', domicilio: '' });
      onAdded();
    } catch (e) {
      setErr(e.response?.data?.error || 'Error al guardar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div style={{ padding: 12, background: '#faf9f4', borderRadius: 6, marginTop: 10 }}>
      <h4 style={{ marginTop: 0, fontSize: 13 }}>Agregar accionista</h4>
      <div className="row-2">
        <div className="field"><label>Tipo</label>
          <select className="input" value={d.tipo_persona} onChange={(e) => setD({ ...d, tipo_persona: e.target.value })}>
            <option value="individual">Persona individual</option>
            <option value="juridico">Persona jurídica</option>
          </select>
        </div>
        <div className="field"><label>Nombre completo *</label>
          <input className="input" value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} />
        </div>
      </div>
      <div className="row-2">
        <div className="field"><label>{d.tipo_persona === 'juridico' ? 'NIT *' : 'DPI *'}</label>
          <input className="input" value={d.dpi_o_nit} onChange={(e) => setD({ ...d, dpi_o_nit: e.target.value })} />
        </div>
        {d.tipo_persona === 'individual' && (
          <div className="field"><label>Género</label>
            <select className="input" value={d.genero} onChange={(e) => setD({ ...d, genero: e.target.value })}>
              <option value="M">Masculino</option><option value="F">Femenino</option>
            </select>
          </div>
        )}
      </div>
      {d.tipo_persona === 'individual' && (
        <div className="row-2">
          <div className="field"><label>Fecha de nacimiento</label>
            <input className="input" type="date" value={d.fecha_nac} onChange={(e) => setD({ ...d, fecha_nac: e.target.value })} />
          </div>
          <div className="field"><label>Estado civil</label>
            <select className="input" value={d.estado_civil} onChange={(e) => setD({ ...d, estado_civil: e.target.value })}>
              <option value="">—</option>
              <option value="soltero">Soltero/a</option>
              <option value="casado">Casado/a</option>
              <option value="divorciado">Divorciado/a</option>
              <option value="viudo">Viudo/a</option>
            </select>
          </div>
        </div>
      )}
      <div className="row-2">
        <div className="field"><label>Cantidad de acciones *</label>
          <input className="input" type="number" value={d.acciones_cantidad} onChange={(e) => setD({ ...d, acciones_cantidad: e.target.value })} />
          <div className="muted" style={{ fontSize: 11 }}>Total de la sociedad: {totalAcciones}</div>
        </div>
        <div className="field"><label>Porcentaje *</label>
          <input className="input" type="number" step="0.01" value={d.porcentaje} onChange={(e) => setD({ ...d, porcentaje: e.target.value })} />
          <div className="muted" style={{ fontSize: 11 }}>Disponible: {Math.max(0, 100 - sumaActual)}%</div>
        </div>
      </div>
      {err && <div className="alert alert-danger" style={{ fontSize: 12 }}>{err}</div>}
      <button className="btn btn-gold btn-sm" onClick={submit} disabled={!valid || guardando} style={{ marginTop: 8 }}>
        {guardando ? 'Guardando…' : 'Agregar accionista'}
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Representantes
// ──────────────────────────────────────────────────────────────

function ListaRepresentantes({ representantes, token, onChange }) {
  if (!representantes || representantes.length === 0) {
    return <div className="muted" style={{ fontSize: 12.5, padding: '8px 0' }}>Aún no agregó representantes.</div>;
  }
  return (
    <table className="table-light" style={{ width: '100%', fontSize: 13 }}>
      <thead>
        <tr style={{ textAlign: 'left', color: 'var(--text-dim)', fontSize: 11 }}>
          <th>Nombre</th><th>Cargo</th><th>DPI</th><th />
        </tr>
      </thead>
      <tbody>
        {representantes.map((r) => (
          <tr key={r.id} style={{ borderTop: '0.5px solid var(--border)' }}>
            <td style={{ padding: '6px 0' }}>{r.nombre}</td>
            <td>{r.cargo}</td>
            <td className="muted">{r.dpi}</td>
            <td style={{ textAlign: 'right' }}>
              <button className="btn btn-sm btn-ghost" onClick={async () => {
                if (!confirm('¿Eliminar este representante?')) return;
                await publicDeleteRepresentante(token, r.id);
                onChange();
              }}>Quitar</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FormRepresentante({ token, onAdded }) {
  const [d, setD] = useState({
    nombre: '', dpi: '', fecha_nac: '', genero: 'M', estado_civil: '',
    cargo: 'Administrador Único', vigencia_inicio: new Date().toISOString().slice(0, 10),
    vigencia_vencimiento: '',
  });
  const [err, setErr] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const valid = d.nombre && d.dpi && d.cargo && d.vigencia_inicio;

  const submit = async () => {
    if (!valid) return;
    setGuardando(true); setErr(null);
    try {
      await publicCreateRepresentante(token, d);
      setD({ ...d, nombre: '', dpi: '' });
      onAdded();
    } catch (e) {
      setErr(e.response?.data?.error || 'Error al guardar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div style={{ padding: 12, background: '#faf9f4', borderRadius: 6, marginTop: 10 }}>
      <h4 style={{ marginTop: 0, fontSize: 13 }}>Agregar representante</h4>
      <div className="row-2">
        <div className="field"><label>Nombre completo *</label>
          <input className="input" value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} />
        </div>
        <div className="field"><label>DPI *</label>
          <input className="input" value={d.dpi} onChange={(e) => setD({ ...d, dpi: e.target.value })} />
        </div>
      </div>
      <div className="row-2">
        <div className="field"><label>Cargo *</label>
          <select className="input" value={d.cargo} onChange={(e) => setD({ ...d, cargo: e.target.value })}>
            {CARGOS_REPRESENTANTE.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="field"><label>Género</label>
          <select className="input" value={d.genero} onChange={(e) => setD({ ...d, genero: e.target.value })}>
            <option value="M">Masculino</option><option value="F">Femenino</option>
          </select>
        </div>
      </div>
      <div className="row-2">
        <div className="field"><label>Vigencia inicio *</label>
          <input className="input" type="date" value={d.vigencia_inicio} onChange={(e) => setD({ ...d, vigencia_inicio: e.target.value })} />
        </div>
        <div className="field"><label>Vigencia vencimiento (opcional)</label>
          <input className="input" type="date" value={d.vigencia_vencimiento} onChange={(e) => setD({ ...d, vigencia_vencimiento: e.target.value })} />
          <div className="muted" style={{ fontSize: 11 }}>Vacío = indefinido</div>
        </div>
      </div>
      {err && <div className="alert alert-danger" style={{ fontSize: 12 }}>{err}</div>}
      <button className="btn btn-gold btn-sm" onClick={submit} disabled={!valid || guardando} style={{ marginTop: 8 }}>
        {guardando ? 'Guardando…' : 'Agregar representante'}
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Direcciones
// ──────────────────────────────────────────────────────────────

function ListaDirecciones({ direcciones, token, onChange }) {
  if (!direcciones || direcciones.length === 0) {
    return <div className="muted" style={{ fontSize: 12.5, padding: '8px 0' }}>Aún no agregó direcciones.</div>;
  }
  return (
    <ul style={{ paddingLeft: 18, margin: 0, fontSize: 13 }}>
      {direcciones.map((d) => (
        <li key={d.id} style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
          <span><strong style={{ textTransform: 'capitalize' }}>{d.tipo}:</strong> {d.direccion}, {d.municipio}, {d.departamento}</span>
          <button className="btn btn-sm btn-ghost" onClick={async () => {
            if (!confirm('¿Eliminar esta dirección?')) return;
            await publicDeleteDireccion(token, d.id);
            onChange();
          }}>Quitar</button>
        </li>
      ))}
    </ul>
  );
}

function FormDireccion({ token, onAdded, existentes }) {
  const [d, setD] = useState({ tipo: 'fiscal', direccion: '', municipio: '', departamento: 'Guatemala' });
  const [err, setErr] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const tiposDisponibles = TIPOS_DIRECCION.filter((t) => !existentes.includes(t.value));

  const submit = async () => {
    if (!d.tipo || !d.direccion || !d.municipio || !d.departamento) return;
    setGuardando(true); setErr(null);
    try {
      await publicCreateDireccion(token, d);
      setD({ tipo: tiposDisponibles[0]?.value || 'fiscal', direccion: '', municipio: '', departamento: 'Guatemala' });
      onAdded();
    } catch (e) {
      setErr(e.response?.data?.error || 'Error al guardar');
    } finally {
      setGuardando(false);
    }
  };

  if (tiposDisponibles.length === 0) return null;

  return (
    <div style={{ padding: 12, background: '#faf9f4', borderRadius: 6, marginTop: 10 }}>
      <h4 style={{ marginTop: 0, fontSize: 13 }}>Agregar dirección</h4>
      <div className="row-2">
        <div className="field"><label>Tipo</label>
          <select className="input" value={d.tipo} onChange={(e) => setD({ ...d, tipo: e.target.value })}>
            {tiposDisponibles.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="field"><label>Municipio</label>
          <input className="input" value={d.municipio} onChange={(e) => setD({ ...d, municipio: e.target.value })} />
        </div>
      </div>
      <div className="field">
        <label>Dirección completa</label>
        <input className="input" value={d.direccion} onChange={(e) => setD({ ...d, direccion: e.target.value })} />
      </div>
      <div className="field">
        <label>Departamento</label>
        <input className="input" value={d.departamento} onChange={(e) => setD({ ...d, departamento: e.target.value })} />
      </div>
      {err && <div className="alert alert-danger" style={{ fontSize: 12 }}>{err}</div>}
      <button className="btn btn-gold btn-sm" onClick={submit} disabled={guardando} style={{ marginTop: 8 }}>
        {guardando ? 'Guardando…' : 'Agregar dirección'}
      </button>
    </div>
  );
}
