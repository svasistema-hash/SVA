import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { Search, ChevronRight, Plus, Filter } from 'lucide-react';
import Topbar from '../../components/Topbar';
import Breadcrumb from '../../components/Breadcrumb';
import SelectorTipoPersona from '../../components/SelectorTipoPersona';
import { tenantBreadcrumb } from '../../utils/breadcrumb';
import { listClientes } from '../../api/clientes';
import { fetchContratos } from '../../api/contratos';
import { crearTokenInstitucion as crearToken } from '../../api/solicitudes';

// Tabs y conteos
const TABS = [
  { key: 'todos',        label: 'Todos' },
  { key: 'individuales', label: 'Individuales', tipoPersona: 'individual' },
  { key: 'juridicos',    label: 'Jurídicos',    tipoPersona: 'juridica' },
];

const TIPOS_SOCIEDAD = ['S.A.','S.R.L.','Sociedad Civil','E.M.I.','Cooperativa','Asociación/Fundación','Otra'];

const PAGE_SIZE = 20;

function tabFromPath(pathname) {
  if (pathname.includes('/clientes/individuales')) return 'individuales';
  if (pathname.includes('/clientes/juridicos'))    return 'juridicos';
  return 'todos';
}

function computeAge(fechaNac) {
  if (!fechaNac || !/^\d{4}-\d{2}-\d{2}/.test(fechaNac)) return null;
  const birth = new Date(fechaNac + 'T00:00:00');
  if (isNaN(birth.getTime())) return null;
  const diff = Date.now() - birth.getTime();
  const years = Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
  return years >= 0 && years < 130 ? years : null;
}

export default function TenantClientes() {
  const { inst } = useOutletContext() || {};
  const nav = useNavigate();
  const loc = useLocation();

  // Estado del tab basado en la URL
  const tabFromUrl = tabFromPath(loc.pathname);
  const [tab, setTab] = useState(tabFromUrl);
  useEffect(() => { setTab(tabFromUrl); }, [tabFromUrl]);

  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [estado, setEstado] = useState('activo');
  const [tipoSociedadFilter, setTipoSociedadFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showSelector, setShowSelector] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [page, setPage] = useState(1);

  const [clientes, setClientes] = useState([]);
  const [contratos, setContratos] = useState([]);
  const [pendientes, setPendientes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Debounce del search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Reset paginación al cambiar tab/búsqueda/estado
  useEffect(() => { setPage(1); }, [tab, debouncedQ, estado, tipoSociedadFilter]);

  // Carga de datos
  useEffect(() => {
    if (!inst) return;
    let alive = true;
    setLoading(true);
    Promise.all([
      // Lista principal: trae todos y filtramos en JS para tabs+counts
      listClientes({ q: debouncedQ, estado: estado || undefined, institucion_id: inst.id }),
      // Pendientes (solo informativos)
      listClientes({ estado: 'pendiente', institucion_id: inst.id }),
      // Contratos (para conteo por cliente)
      fetchContratos({ institucion: inst.slug }),
    ])
      .then(([cs, p, ct]) => {
        if (!alive) return;
        setClientes(cs);
        setPendientes(p);
        setContratos(ct);
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [inst?.id, debouncedQ, estado]);

  // Counts por tab (sobre el resultado actual del backend)
  const counts = useMemo(() => ({
    todos: clientes.length,
    individuales: clientes.filter((c) => (c.tipo_persona || 'individual') === 'individual').length,
    juridicos:    clientes.filter((c) => c.tipo_persona === 'juridica').length,
  }), [clientes]);

  // Lista filtrada por el tab activo (+ filtro tipo_sociedad si Jurídicos)
  const filtered = useMemo(() => {
    let list = clientes;
    if (tab === 'individuales') list = list.filter((c) => (c.tipo_persona || 'individual') === 'individual');
    if (tab === 'juridicos')    list = list.filter((c) => c.tipo_persona === 'juridica');
    if (tab === 'juridicos' && tipoSociedadFilter) {
      list = list.filter((c) => c.tipo_sociedad === tipoSociedadFilter);
    }
    return list;
  }, [clientes, tab, tipoSociedadFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Conteo de contratos por cliente
  const contratosPorCliente = (c) => {
    // Para individuales matchea por dpi; para jurídicos no hay matching directo todavía.
    if (c.tipo_persona === 'juridica') return 0;
    return contratos.filter((x) => x.datos_cliente?.dpi === c.dpi).length;
  };

  const navToDetalle = (c) => {
    const base = `/instituciones/${inst.slug}/clientes`;
    if (c.tipo_persona === 'juridica') nav(`${base}/juridicos/${c.id}`);
    else nav(`${base}/individuales/${c.id}`);
  };

  const handleNuevo = (tipo) => {
    setShowSelector(false);
    if (tipo === 'individual') nav(`/instituciones/${inst.slug}/clientes/individuales/nuevo`);
    else nav(`/instituciones/${inst.slug}/clientes/juridicos/nuevo`);
  };

  const onTabClick = (tabKey) => {
    setTab(tabKey);
    // Sincroniza URL para que el sidebar refleje el tab y el navegar atrás funcione.
    const base = `/instituciones/${inst.slug}/clientes`;
    if (tabKey === 'todos')        nav(base, { replace: true });
    if (tabKey === 'individuales') nav(`${base}/individuales`, { replace: true });
    if (tabKey === 'juridicos')    nav(`${base}/juridicos`, { replace: true });
  };

  if (!inst) {
    return (<><Topbar title="Cargando…" /><div className="app-content"><div className="empty"><span className="spinner" /></div></div></>);
  }

  return (
    <>
      <Topbar
        title="Clientes"
        crumbs={<Breadcrumb segments={tenantBreadcrumb(inst, 'Clientes')} />}
        actions={
          <>
            <button className="btn" onClick={() => setShowLink(true)}>Enviar link al cliente</button>
            <button className="btn btn-gold" onClick={() => setShowSelector(true)}>
              <Plus size={14} strokeWidth={2} />
              <span style={{ marginLeft: 6 }}>Nuevo cliente</span>
            </button>
          </>
        }
      />

      <div className="app-content">
        {/* Solicitudes pendientes */}
        {pendientes.length > 0 && (
          <div className="card" style={{ background: 'var(--gold-soft)', borderColor: 'var(--gold-border)', marginBottom: 18 }}>
            <div className="card-h">
              <h3>Solicitudes pendientes · {pendientes.length}</h3>
              <span className="muted" style={{ fontSize: 11.5 }}>Clientes que llenaron el formulario público y esperan verificación</span>
            </div>
            <table className="tbl">
              <thead><tr><th>Nombre</th><th>DPI</th><th>Teléfono</th><th>Recibido</th><th></th></tr></thead>
              <tbody>
                {pendientes.map((c) => (
                  <tr key={c.id} onClick={() => nav(`individuales/${c.id}?verificar=1`)}>
                    <td><strong>{c.nombre}</strong></td>
                    <td><code>{c.dpi || '—'}</code></td>
                    <td>{c.telefono || '—'}</td>
                    <td className="muted">{c.created_at}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-gold btn-sm" onClick={(e) => { e.stopPropagation(); nav(`individuales/${c.id}?verificar=1`); }}>
                        Verificar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tabs subrayados */}
        <div style={{
          display: 'flex', gap: 0,
          borderBottom: '0.5px solid var(--border-light)',
          marginBottom: 18,
        }}>
          {TABS.map((t) => {
            const isActive = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => onTabClick(t.key)}
                style={{
                  padding: '10px 18px',
                  marginBottom: -0.5,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: isActive ? '1.5px solid var(--gold)' : '1.5px solid transparent',
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12.5,
                  fontWeight: isActive ? 500 : 400,
                  letterSpacing: 0.02,
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                {t.label}
                <span style={{
                  marginLeft: 6,
                  color: 'var(--text-tertiary)',
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 11,
                }}>
                  ({counts[t.key]})
                </span>
              </button>
            );
          })}
        </div>

        {/* Toolbar: search + filtros */}
        <div className="toolbar" style={{ marginBottom: 14, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '0 1 380px' }}>
            <Search
              size={14} strokeWidth={1.5}
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }}
            />
            <input
              className="input"
              style={{ paddingLeft: 30 }}
              placeholder="Buscar por nombre, DPI, NIT o razón social"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Buscar"
            />
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => setShowFilters((s) => !s)}
            aria-expanded={showFilters}
          >
            <Filter size={14} strokeWidth={1.5} />
            <span style={{ marginLeft: 6 }}>Filtros</span>
          </button>
          <div className="spacer" />
        </div>

        {showFilters && (
          <div className="card" style={{ marginBottom: 14, padding: '14px 18px' }}>
            <div className="row-3" style={{ alignItems: 'end' }}>
              <div className="field" style={{ margin: 0 }}>
                <label>Estado</label>
                <select className="select" value={estado} onChange={(e) => setEstado(e.target.value)}>
                  <option value="activo">Activos</option>
                  <option value="pendiente">Pendientes</option>
                  <option value="inactivo">Inactivos</option>
                  <option value="">Todos</option>
                </select>
              </div>
              {tab === 'juridicos' && (
                <div className="field" style={{ margin: 0 }}>
                  <label>Tipo de sociedad</label>
                  <select className="select" value={tipoSociedadFilter} onChange={(e) => setTipoSociedadFilter(e.target.value)}>
                    <option value="">Todas</option>
                    {TIPOS_SOCIEDAD.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              )}
              <div style={{ alignSelf: 'end', display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn" onClick={() => { setEstado('activo'); setTipoSociedadFilter(''); }}>Limpiar</button>
              </div>
            </div>
          </div>
        )}

        {/* Tabla principal */}
        {loading ? (
          <div className="empty"><span className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty">{debouncedQ ? `Sin resultados para "${debouncedQ}".` : 'No hay clientes con ese filtro.'}</div>
        ) : (
          <>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Tipo</th>
                  <th>Nombre / Razón social</th>
                  <th style={{ width: 180 }}>DPI / NIT</th>
                  <th style={{ width: 110 }}>Contratos</th>
                  <th style={{ width: 30 }}></th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((c) => {
                  const isJur = c.tipo_persona === 'juridica';
                  const age = isJur ? null : computeAge(c.fecha_nac);
                  const subtitle = isJur
                    ? [c.nombre_comercial, c.tipo_sociedad].filter(Boolean).join(' · ')
                    : [age != null ? `${age} años` : null, c.profesion].filter(Boolean).join(' · ');
                  return (
                    <tr key={c.id} onClick={() => navToDetalle(c)}>
                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 3,
                            fontFamily: "'DM Sans', sans-serif",
                            fontSize: 9,
                            fontWeight: 500,
                            letterSpacing: 0.1,
                            border: '0.5px solid',
                            ...(isJur
                              ? { background: 'var(--gold-pale)', color: 'var(--gold)', borderColor: 'var(--gold-border)' }
                              : { background: 'var(--bg-subtle)', color: 'var(--text-secondary)', borderColor: 'var(--border-mid)' }
                            ),
                          }}
                        >
                          {isJur ? 'JUR' : 'IND'}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{c.nombre}</div>
                        {subtitle && <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{subtitle}</div>}
                      </td>
                      <td>
                        <code style={{ fontSize: 11.5 }}>{(isJur ? c.nit : c.dpi) || '—'}</code>
                      </td>
                      <td style={{ fontFamily: "'DM Mono', monospace", fontSize: 12 }}>
                        {contratosPorCliente(c)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <ChevronRight size={14} strokeWidth={1.5} color="var(--text-tertiary)" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Paginación */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 14,
              fontSize: 11.5,
              color: 'var(--text-secondary)',
            }}>
              <span>
                Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  className="btn btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >Anterior</button>
                <span style={{ color: 'var(--text-tertiary)' }}>Página {page} de {totalPages}</span>
                <button
                  className="btn btn-sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >Siguiente</button>
              </div>
            </div>
          </>
        )}

        {showSelector && (
          <SelectorTipoPersona
            onClose={() => setShowSelector(false)}
            onSelect={handleNuevo}
          />
        )}

        {showLink && (
          <LinkGeneratorModal slug={inst.slug} onClose={() => setShowLink(false)} />
        )}
      </div>
    </>
  );
}

// ─── LinkGeneratorModal (reutilizado del archivo anterior) ──────────
function LinkGeneratorModal({ slug, onClose }) {
  const [token, setToken] = useState(null);
  const [creating, setCreating] = useState(true);
  const [copied, setCopied] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    crearToken(slug)
      .then((r) => setToken(r))
      .catch((e) => setErr(e.response?.data?.error || e.message))
      .finally(() => setCreating(false));
  }, [slug]);

  const link = token ? `${window.location.origin}/solicitud/${slug}?token=${token.token}` : '';
  const mensaje = `Hola! Te comparto el link para llenar tu solicitud de crédito:\n${link}\n(Vence en 48 horas)`;

  const copy = (text, kind) => {
    navigator.clipboard.writeText(text);
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
  };
  const openWA = () => window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`, '_blank');

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,19,24,0.45)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 20 }} onClick={onClose}>
      <div className="card" style={{ width: 560, maxWidth: '95vw' }} onClick={(e) => e.stopPropagation()}>
        <div className="card-h">
          <h3>Enviar link al cliente</h3>
          <button className="btn-ghost btn" onClick={onClose}>Cerrar</button>
        </div>
        <p className="muted" style={{ marginTop: 0, fontSize: 12.5 }}>
          El cliente abrirá este link en su celular o PC y llenará su solicitud directamente.
          Vence en 48 horas y se invalida después de usarse una vez.
        </p>

        {creating && <div className="empty"><span className="spinner" /> Generando link…</div>}
        {err && <div className="alert alert-danger">{err}</div>}

        {token && (
          <>
            <div className="field">
              <label>Link de solicitud</label>
              <input className="input" value={link} readOnly style={{ background: 'var(--gold-soft)', borderColor: 'var(--gold-border)', fontSize: 11.5 }} onClick={(e) => e.target.select()} />
              <div className="help">Vence: {new Date(token.expires_at).toLocaleString('es-GT')}</div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <button className="btn" onClick={() => copy(link, 'link')}>
                {copied === 'link' ? 'Copiado' : 'Copiar link'}
              </button>
              <button className="btn btn-gold" onClick={openWA}>Compartir por WhatsApp</button>
              <button className="btn" onClick={() => copy(mensaje, 'email')}>
                {copied === 'email' ? 'Copiado' : 'Copiar para email'}
              </button>
            </div>

            <div style={{ marginTop: 14, padding: 10, background: 'var(--bg-subtle)', borderRadius: 4, fontSize: 11.5, color: 'var(--text-secondary)' }}>
              <strong>Mensaje sugerido:</strong><br />
              <pre style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 11.5 }}>{mensaje}</pre>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
