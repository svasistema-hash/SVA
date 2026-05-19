// F1 C4 — Nueva solicitud de contrato.
//
// Flujo:
//   1. Selector cliente existente (búsqueda) o crear nuevo.
//   2. Selector de modelo (filtrado por tipo de garantía aplicable).
//   3. Datos preliminares del préstamo (monto, plazo, tasa, garantía).
//   4. Botón "Generar link" → crea contrato 'en_curso' + token 48h + muestra link copiable.
//
// NO calcula nada matemático: el usuario banco ingresa monto / plazo / tasa / cuota
// manualmente. LexDocs solo valida formatos y guarda.

import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Copy, Check, Search, X, UserPlus } from 'lucide-react';
import Topbar from '../../components/Topbar';
import Breadcrumb from '../../components/Breadcrumb';
import SelectorTipoPersona from '../../components/SelectorTipoPersona';
import { tenantBreadcrumb } from '../../utils/breadcrumb';
import { fetchModelos } from '../../api/instituciones';
import { listClientes } from '../../api/clientes';
import { createContrato, generarTokenCliente } from '../../api/contratos';
import { nextCorrelativo } from '../../api/clientes';

export default function FinancieraNueva() {
  const { inst } = useOutletContext() || {};
  const nav = useNavigate();
  const [modelos, setModelos] = useState([]);
  const [modeloId, setModeloId] = useState('');
  const [cliente, setCliente] = useState(null);          // cliente seleccionado o null
  const [showTipoModal, setShowTipoModal] = useState(false);
  const [credito, setCredito] = useState({
    monto: '', plazo_meses: '', tasa_anual: '', cuota_mensual: '',
    proposito: '', moneda: 'Q',
  });
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState(null);
  const [resultado, setResultado] = useState(null);      // { contrato, token, url }

  useEffect(() => {
    if (!inst) return;
    fetchModelos(inst.slug).then(setModelos).catch(() => setModelos([]));
  }, [inst?.slug]);

  if (!inst) return <><Topbar title="Cargando…" /></>;

  const modeloSeleccionado = modelos.find((m) => m.id === Number(modeloId));

  const onCrearLink = async () => {
    setCreando(true); setError(null);
    try {
      const año = new Date().getFullYear();
      const { correlativo: noContrato } = await nextCorrelativo(inst.id);
      const datosCliente = cliente ? {
        cliente_id: cliente.id,
        nombre: cliente.nombre,
        dpi: cliente.dpi,
        tipo_persona: cliente.tipo_persona,
      } : null;
      const datosCredito = {
        monto: credito.monto,
        plazo_meses: credito.plazo_meses,
        tasa_anual: credito.tasa_anual,
        cuota_mensual: credito.cuota_mensual,
        proposito: credito.proposito,
        moneda: credito.moneda,
      };
      const contrato = await createContrato({
        institucion_id: inst.id,
        modelo_id: Number(modeloId),
        no_contrato: noContrato,
        datos_cliente: datosCliente,
        datos_credito: datosCredito,
      });
      const tokenRes = await generarTokenCliente(contrato.id);
      const url = `${window.location.origin}/solicitud/${tokenRes.token}`;
      setResultado({ contrato, token: tokenRes.token, url, expires_at: tokenRes.expires_at });
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setCreando(false);
    }
  };

  const onSeleccionTipo = (tipo) => {
    setShowTipoModal(false);
    nav(`../clientes/${tipo === 'juridica' ? 'juridicos' : 'individuales'}/nuevo?return_to=financiera_nueva`);
  };

  if (resultado) {
    return <ResultadoLink resultado={resultado} inst={inst} onTerminar={() => nav('en-curso')} onOtra={() => { setResultado(null); setCliente(null); setModeloId(''); setCredito({ monto: '', plazo_meses: '', tasa_anual: '', cuota_mensual: '', proposito: '', moneda: 'Q' }); }} />;
  }

  return (
    <>
      <Topbar
        title="Nueva solicitud"
        crumbs={<Breadcrumb segments={tenantBreadcrumb(inst, 'Financiera', 'Nueva solicitud')} />}
      />
      <div className="app-content">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, maxWidth: 720 }}>
          <SeccionCliente cliente={cliente} setCliente={setCliente} instId={inst.id} onNuevo={() => setShowTipoModal(true)} />
          <SeccionModelo modelos={modelos} modeloId={modeloId} setModeloId={setModeloId} />
          <SeccionCredito credito={credito} setCredito={setCredito} modelo={modeloSeleccionado} />

          {error && <div className="alert alert-danger">{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button className="btn" onClick={() => nav('..')}>Cancelar</button>
            <button
              className="btn btn-gold"
              onClick={onCrearLink}
              disabled={!modeloId || !credito.monto || creando}
            >
              {creando ? 'Creando…' : 'Generar link para el cliente'}
            </button>
          </div>
        </div>
      </div>

      {showTipoModal && (
        <SelectorTipoPersona onClose={() => setShowTipoModal(false)} onSelect={onSeleccionTipo} />
      )}
    </>
  );
}

// ──────────────────────────────────────────────────────────────
// Secciones
// ──────────────────────────────────────────────────────────────

function SeccionCliente({ cliente, setCliente, instId, onNuevo }) {
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    if (!q || q.length < 2) { setResultados([]); return; }
    let cancelado = false;
    setBuscando(true);
    listClientes({ q, institucion_id: instId })
      .then((r) => { if (!cancelado) setResultados(r); })
      .finally(() => { if (!cancelado) setBuscando(false); });
    return () => { cancelado = true; };
  }, [q, instId]);

  if (cliente) {
    return (
      <Card titulo="Cliente">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#faf9f4', border: '0.5px solid var(--border)', borderRadius: 4 }}>
          <div>
            <div style={{ fontWeight: 500 }}>{cliente.nombre}</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
              DPI {cliente.dpi || '—'} · {cliente.tipo_persona === 'juridica' ? 'Persona jurídica' : 'Individual'}
            </div>
          </div>
          <button className="btn btn-ghost" onClick={() => setCliente(null)} aria-label="Cambiar cliente">
            <X size={14} />
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card titulo="Cliente" hint="Busque uno existente o cree uno nuevo">
      <div style={{ position: 'relative' }}>
        <input
          className="input"
          placeholder="Buscar por nombre, DPI o NIT…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ paddingLeft: 36 }}
        />
        <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
      </div>

      {q.length >= 2 && (
        <div style={{ marginTop: 10, maxHeight: 240, overflow: 'auto', border: '0.5px solid var(--border)', borderRadius: 4 }}>
          {buscando ? (
            <div style={{ padding: 14, textAlign: 'center', fontSize: 12, color: 'var(--text-dim)' }}>Buscando…</div>
          ) : resultados.length === 0 ? (
            <div style={{ padding: 14, fontSize: 13, color: 'var(--text-dim)' }}>Sin resultados.</div>
          ) : (
            resultados.slice(0, 6).map((c) => (
              <div
                key={c.id}
                onClick={() => setCliente(c)}
                style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--border)', cursor: 'pointer' }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#faf9f4'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ fontSize: 13, fontWeight: 500 }}>{c.nombre}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                  DPI {c.dpi || '—'} · {c.tipo_persona === 'juridica' ? 'Jurídico' : 'Individual'}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onNuevo} style={{ fontSize: 13 }}>
          <UserPlus size={14} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
          Crear nuevo cliente
        </button>
      </div>
    </Card>
  );
}

function SeccionModelo({ modelos, modeloId, setModeloId }) {
  return (
    <Card titulo="Modelo de contrato">
      <select className="select" value={modeloId} onChange={(e) => setModeloId(e.target.value)}>
        <option value="">Seleccione un modelo</option>
        {modelos.filter((m) => m.activo).map((m) => (
          <option key={m.id} value={m.id}>{m.nombre} ({m.tipo_garantia})</option>
        ))}
      </select>
    </Card>
  );
}

function SeccionCredito({ credito, setCredito, modelo }) {
  const upd = (parche) => setCredito({ ...credito, ...parche });
  return (
    <Card titulo="Datos preliminares del préstamo" hint="Los valores que el banco ya tiene. El cliente los confirmará. Aquí no se calcula nada: ingrese los números acordados.">
      <div className="row-2">
        <Field label="Monto" requerido>
          <input className="input" inputMode="decimal" placeholder="0.00" value={credito.monto} onChange={(e) => upd({ monto: e.target.value })} />
        </Field>
        <Field label="Moneda">
          <select className="select" value={credito.moneda} onChange={(e) => upd({ moneda: e.target.value })}>
            <option value="Q">Quetzales (Q)</option>
            <option value="USD">Dólares (USD)</option>
          </select>
        </Field>
      </div>
      <div className="row-2">
        <Field label="Plazo en meses">
          <input className="input" inputMode="numeric" placeholder="60" value={credito.plazo_meses} onChange={(e) => upd({ plazo_meses: e.target.value })} />
        </Field>
        <Field label="Tasa de interés anual (%)">
          <input className="input" inputMode="decimal" placeholder="14.5" value={credito.tasa_anual} onChange={(e) => upd({ tasa_anual: e.target.value })} />
        </Field>
      </div>
      <Field label="Cuota mensual" hint="Como la calculó su sistema. Ingrese el valor exacto que va a aparecer en el contrato.">
        <input className="input" inputMode="decimal" placeholder="0.00" value={credito.cuota_mensual} onChange={(e) => upd({ cuota_mensual: e.target.value })} />
      </Field>
      <Field label="Propósito del crédito">
        <input className="input" placeholder="Compra de vivienda, capital de trabajo…" value={credito.proposito} onChange={(e) => upd({ proposito: e.target.value })} />
      </Field>
      {modelo && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>
          Tipo de garantía del modelo: <strong>{modelo.tipo_garantia}</strong>. El cliente completará los datos de la garantía en el portal.
        </div>
      )}
    </Card>
  );
}

function Card({ titulo, hint, children }) {
  return (
    <section style={{ background: '#fff', border: '0.5px solid var(--border)', borderRadius: 6, padding: 20 }}>
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{titulo}</h3>
        {hint && <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 4 }}>{hint}</div>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, requerido, hint, children }) {
  return (
    <div className="field">
      <label>{label}{requerido && <span style={{ color: 'var(--danger)', marginLeft: 4 }}>*</span>}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Pantalla de resultado: link generado
// ──────────────────────────────────────────────────────────────

function ResultadoLink({ resultado, inst, onTerminar, onOtra }) {
  const [copiado, setCopiado] = useState(null);
  const copiar = (texto, kind) => {
    navigator.clipboard.writeText(texto);
    setCopiado(kind);
    setTimeout(() => setCopiado(null), 2000);
  };
  const mensaje = `Hola, le compartimos el link para completar su solicitud en ${inst.nombre}:\n\n${resultado.url}\n\nVence en 48 horas.`;

  return (
    <>
      <Topbar
        title="Link generado"
        crumbs={<Breadcrumb segments={tenantBreadcrumb(inst, 'Financiera', 'Nueva solicitud')} />}
      />
      <div className="app-content">
        <div style={{ maxWidth: 720 }}>
          <div className="card" style={{ borderColor: 'var(--gold)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#e6f7ed', display: 'grid', placeItems: 'center' }}>
                <Check size={20} color="#2d6a4f" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16 }}>Solicitud creada</h3>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
                  Contrato <code>{resultado.contrato.no_contrato}</code> · El link vence el {new Date(resultado.expires_at).toLocaleString('es-GT')}
                </div>
              </div>
            </div>

            <div style={{ background: '#faf9f4', border: '0.5px solid var(--border)', borderRadius: 4, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Link para el cliente</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <code style={{ flex: 1, fontSize: 13, padding: '6px 10px', background: '#fff', border: '0.5px solid var(--border)', borderRadius: 3, wordBreak: 'break-all' }}>{resultado.url}</code>
                <button className="btn btn-gold" onClick={() => copiar(resultado.url, 'url')} style={{ minWidth: 100 }}>
                  {copiado === 'url' ? <><Check size={14} style={{ verticalAlign: 'text-bottom' }} /> Copiado</> : <><Copy size={14} style={{ verticalAlign: 'text-bottom' }} /> Copiar</>}
                </button>
              </div>
            </div>

            <div style={{ background: '#faf9f4', border: '0.5px solid var(--border)', borderRadius: 4, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Mensaje sugerido</div>
              <textarea readOnly value={mensaje} rows={5} style={{ width: '100%', border: '0.5px solid var(--border)', borderRadius: 3, padding: 10, fontSize: 13, fontFamily: 'inherit', resize: 'none', boxSizing: 'border-box' }} />
              <div style={{ marginTop: 8, textAlign: 'right' }}>
                <button className="btn" onClick={() => copiar(mensaje, 'mensaje')}>
                  {copiado === 'mensaje' ? 'Copiado' : 'Copiar mensaje'}
                </button>
              </div>
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.55, paddingTop: 8, borderTop: '0.5px solid var(--border)' }}>
              Envíelo al cliente por su canal habitual (WhatsApp, SMS, correo). LexDocs no envía notificaciones automáticas. Mientras el cliente no haya completado el formulario, la solicitud aparecerá en <strong>En curso</strong>.
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <button className="btn" onClick={onOtra}>Crear otra solicitud</button>
            <button className="btn btn-gold" onClick={onTerminar}>Ir a En curso</button>
          </div>
        </div>
      </div>
    </>
  );
}
