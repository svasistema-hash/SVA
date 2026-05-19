// Portal público del cliente (F1 C3).
// Ruta: /solicitud/:token (sin auth).
//
// 7 sub-pasos:
//   C1 Bienvenida + autorización tratamiento de datos
//   C2 Subir DPI (frente + reverso) → OCR → datos editables
//   C3 Datos personales (fecha_nac obligatoria, genero, estado civil, ...)
//   C4 Domicilio → subir recibo → OCR → dirección editable
//   C5 Fiadores (opcional, lista con agregar/editar/eliminar)
//   C6 Garantías (según tipo del contrato)
//   C7 Confirmación → enviar al banco

import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  validarTokenContrato, guardarBorrador, subirDpiCliente,
  subirReciboCliente, confirmarSolicitud,
} from '../api/solicitudes';

const TOTAL_PASOS = 7;
const TITULOS = {
  1: 'Bienvenida',
  2: 'Identificación',
  3: 'Datos personales',
  4: 'Domicilio',
  5: 'Fiadores',
  6: 'Garantía',
  7: 'Confirmación',
};

const FIADOR_VACIO = () => ({
  id: Math.random().toString(36).slice(2, 10),
  nombre: '', dpi: '', telefono: '', profesion: '', tipo: 'personal',
  hipoteca: { finca: '', folio: '', libro: '', municipio: '', dimensiones: '' },
  prenda: { tipo_bien: '', marca: '', linea: '', modelo: '', serie: '', placa: '', motor: '', chasis: '' },
});

const DATOS_INICIALES = {
  paso_actual: 1,
  autorizo_tratamiento: false,
  // C2 — identificación
  dpi: '', dpi_scan_frente: null, dpi_scan_reverso: null,
  dpi_frente_url: null, dpi_reverso_url: null,
  // C3 — personales
  nombre: '', fecha_nac: '', lugar_nac: '',
  genero: '', estado_civil: '',
  profesion: '', nit: '', telefono: '', email: '',
  ingresos: '', empleo: '',
  conyuge_nombre: '', conyuge_dpi: '',
  // C4 — domicilio
  domicilio: '', recibo_path: null,
  // C5 — fiadores
  fiadores: [],
  // C6 — garantía
  garantia: { hipoteca: {}, prenda: {} },
  // C7 — autorización final
  datos_veridicos: false,
  autorizo_referencias: false,
};

// ─── colores y estilos (más cálidos que el panel interno) ──────────
const C = {
  fondo: '#f8f5ec',
  card: '#ffffff',
  borde: '#e7ddc4',
  bordeFuerte: '#c9b377',
  texto: '#2b2515',
  textoSuave: '#6b6452',
  acento: '#a07d2e',
  acentoSuave: '#f3ead0',
  exito: '#2d6a4f',
  alerta: '#b67318',
  error: '#a52a2a',
};

const HAIRLINE = `0.5px solid ${C.borde}`;

export default function SolicitudPublica() {
  const { token } = useParams();
  const [validacion, setValidacion] = useState({ loading: true, error: null, data: null });
  const [d, setD] = useState(DATOS_INICIALES);
  const [enviando, setEnviando] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);
  const guardadoTimeoutRef = useRef(null);
  const ultimoGuardadoRef = useRef('');

  // Carga inicial del token + borrador.
  useEffect(() => {
    if (!token) {
      setValidacion({ loading: false, error: { tipo: 'no_token', mensaje: 'Falta el código en el enlace.' }, data: null });
      return;
    }
    validarTokenContrato(token)
      .then((r) => {
        setValidacion({ loading: false, error: null, data: r });
        if (r.borrador) {
          setD((s) => ({ ...s, ...r.borrador }));
        }
      })
      .catch((e) => {
        const code = e.response?.data?.code;
        const mensaje = e.response?.data?.error || 'No se pudo cargar el enlace.';
        setValidacion({ loading: false, error: { tipo: code || 'desconocido', mensaje }, data: null });
      });
  }, [token]);

  // Auto-save: cuando los datos cambian, guarda en backend con debounce 800ms.
  useEffect(() => {
    if (!validacion.data) return;
    if (guardadoTimeoutRef.current) clearTimeout(guardadoTimeoutRef.current);
    guardadoTimeoutRef.current = setTimeout(() => {
      const serializado = JSON.stringify(d);
      if (serializado === ultimoGuardadoRef.current) return;
      guardarBorrador(token, d)
        .then(() => { ultimoGuardadoRef.current = serializado; })
        .catch(() => {});
    }, 800);
    return () => guardadoTimeoutRef.current && clearTimeout(guardadoTimeoutRef.current);
  }, [d, token, validacion.data]);

  const upd = useCallback((p) => setD((s) => ({ ...s, ...p })), []);
  const setPaso = useCallback((n) => setD((s) => ({ ...s, paso_actual: n })), []);

  const onScanDpi = async (file, lado) => {
    const r = await subirDpiCliente(token, file);
    const updates = {
      [lado === 'frente' ? 'dpi_scan_frente' : 'dpi_scan_reverso']: r.dpi_scan_path,
    };
    if (lado === 'frente') {
      // Solo el frente trae datos relevantes (RENAP imprime ahí los datos personales).
      if (r.dpi) updates.dpi = r.dpi;
      if (r.nombre && !d.nombre) updates.nombre = r.nombre;
      if (r.fecha_nac && !d.fecha_nac) updates.fecha_nac = r.fecha_nac;
      if (r.lugar_nac && !d.lugar_nac) updates.lugar_nac = r.lugar_nac;
    }
    upd(updates);
    return r;
  };

  const onScanRecibo = async (file) => {
    const r = await subirReciboCliente(token, file);
    const updates = { recibo_path: r.recibo_path };
    if (r.domicilio && !d.domicilio) updates.domicilio = r.domicilio;
    upd(updates);
    return r;
  };

  const enviar = async () => {
    setEnviando(true); setError(null);
    try {
      const r = await confirmarSolicitud(token, d);
      setDone(r);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setEnviando(false);
    }
  };

  if (validacion.loading) return <Pantalla><Centro><Spinner /></Centro></Pantalla>;

  if (validacion.error) {
    const t = validacion.error.tipo;
    if (t === 'token_vencido') {
      return <PantallaError titulo="Enlace vencido" mensaje="El enlace que recibió ya no es válido. Comuníquese con su banco para solicitar uno nuevo." />;
    }
    if (t === 'token_usado') {
      return <PantallaError titulo="Solicitud ya enviada" mensaje="Esta solicitud ya fue recibida por el banco. Si necesita modificar algo, comuníquese directamente con su asesor." />;
    }
    if (t === 'token_no_existe') {
      return <PantallaError titulo="Enlace no válido" mensaje="El enlace no es reconocido por el sistema. Verifique que esté completo." />;
    }
    return <PantallaError titulo="No se pudo abrir el enlace" mensaje={validacion.error.mensaje} />;
  }

  if (done) {
    return (
      <Pantalla>
        <HeaderBanco institucion={validacion.data.institucion} />
        <Centro>
          <div style={{ width: 56, height: 56, borderRadius: '50%', border: `1px solid ${C.exito}`, margin: '0 auto 18px', display: 'grid', placeItems: 'center' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.exito} strokeWidth="1.5"><path d="M5 12l5 5L20 7" /></svg>
          </div>
          <h2 style={{ fontWeight: 500, marginBottom: 12 }}>Solicitud enviada</h2>
          <p style={{ color: C.textoSuave }}>Su solicitud fue recibida correctamente.</p>
          <p style={{ fontSize: 14, color: C.textoSuave, marginTop: 6 }}>
            Número de contrato: <strong>{done.no_contrato}</strong>
          </p>
          <p style={{ fontSize: 14, color: C.textoSuave, marginTop: 24, maxWidth: 380, marginLeft: 'auto', marginRight: 'auto' }}>
            El equipo de <strong>{done.institucion_nombre}</strong> revisará la información y se pondrá en contacto con usted.
          </p>
        </Centro>
      </Pantalla>
    );
  }

  const inst = validacion.data.institucion;
  const modelo = validacion.data.modelo;
  const tipoGarantia = modelo?.tipo_garantia || 'personal';
  const paso = d.paso_actual || 1;

  return (
    <Pantalla>
      <HeaderBanco institucion={inst} />
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 60px' }}>
        <Indicador pasoActual={paso} total={TOTAL_PASOS} titulo={TITULOS[paso]} />

        <Card>
          {paso === 1 && <Paso1Bienvenida d={d} upd={upd} inst={inst} />}
          {paso === 2 && <Paso2DPI d={d} upd={upd} onScan={onScanDpi} />}
          {paso === 3 && <Paso3Personales d={d} upd={upd} />}
          {paso === 4 && <Paso4Domicilio d={d} upd={upd} onScan={onScanRecibo} />}
          {paso === 5 && <Paso5Fiadores d={d} upd={upd} />}
          {paso === 6 && <Paso6Garantia d={d} upd={upd} tipo={tipoGarantia} />}
          {paso === 7 && <Paso7Confirmar d={d} upd={upd} enviar={enviar} enviando={enviando} error={error} />}

          <Navegacion
            paso={paso}
            total={TOTAL_PASOS}
            onPrev={() => setPaso(paso - 1)}
            onNext={() => setPaso(paso + 1)}
            puedeAvanzar={puedeAvanzarDePaso(paso, d, tipoGarantia)}
          />
        </Card>

        <PiePagina />
      </main>
    </Pantalla>
  );
}

// ──────────────────────────────────────────────────────────────
// Lógica de avance
// ──────────────────────────────────────────────────────────────

function puedeAvanzarDePaso(paso, d, _tipoGarantia) {
  if (paso === 1) return !!d.autorizo_tratamiento;
  if (paso === 2) return !!d.dpi && d.dpi.replace(/\s/g, '').length >= 13;
  if (paso === 3) return !!d.nombre && !!d.fecha_nac && !!d.genero && !!d.estado_civil;
  if (paso === 4) return !!d.domicilio && d.domicilio.trim().length >= 8;
  if (paso === 5) return true;
  if (paso === 6) return true;
  if (paso === 7) return d.datos_veridicos && d.autorizo_referencias;
  return false;
}

// ──────────────────────────────────────────────────────────────
// Componentes de UI
// ──────────────────────────────────────────────────────────────

function Pantalla({ children }) {
  return <div style={{ minHeight: '100vh', background: C.fondo, color: C.texto, fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>{children}</div>;
}

function Centro({ children }) {
  return (
    <div style={{ minHeight: 'calc(100vh - 80px)', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24 }}>
      <div style={{ maxWidth: 480 }}>{children}</div>
    </div>
  );
}

function HeaderBanco({ institucion }) {
  return (
    <header style={{ background: C.card, borderBottom: HAIRLINE, padding: '16px 16px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 16, letterSpacing: '-0.01em' }}>{institucion?.nombre || ''}</span>
        </div>
        <div style={{ fontSize: 11, color: C.textoSuave, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Solicitud de contrato vía LexDocs
        </div>
      </div>
    </header>
  );
}

function PantallaError({ titulo, mensaje }) {
  return (
    <Pantalla>
      <Centro>
        <div style={{ width: 56, height: 56, borderRadius: '50%', border: `1px solid ${C.error}`, margin: '0 auto 18px', display: 'grid', placeItems: 'center' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.error} strokeWidth="1.5"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
        </div>
        <h2 style={{ fontWeight: 500, marginBottom: 12 }}>{titulo}</h2>
        <p style={{ color: C.textoSuave, lineHeight: 1.55 }}>{mensaje}</p>
      </Centro>
    </Pantalla>
  );
}

function Spinner() {
  return (
    <div style={{ display: 'inline-block', width: 28, height: 28, border: `2px solid ${C.borde}`, borderTopColor: C.acento, borderRadius: '50%', animation: 'sp 0.8s linear infinite' }}>
      <style>{`@keyframes sp { from { transform: rotate(0); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function Indicador({ pasoActual, total, titulo }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: C.textoSuave, letterSpacing: '0.04em' }}>Paso {pasoActual} de {total}</span>
        <span style={{ fontSize: 12, color: C.textoSuave }}>{titulo}</span>
      </div>
      <div style={{ height: 2, background: C.borde, borderRadius: 1, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${(pasoActual / total) * 100}%`, background: C.acento, transition: 'width 0.3s ease' }} />
      </div>
    </div>
  );
}

function Card({ children }) {
  return (
    <section style={{ background: C.card, border: HAIRLINE, borderRadius: 6, padding: 24 }}>
      {children}
    </section>
  );
}

function Navegacion({ paso, total, onPrev, onNext, puedeAvanzar }) {
  if (paso === total) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 28, paddingTop: 20, borderTop: HAIRLINE }}>
      <Boton variante="ghost" onClick={onPrev} disabled={paso === 1}>Atrás</Boton>
      <Boton variante="primary" onClick={onNext} disabled={!puedeAvanzar}>Continuar</Boton>
    </div>
  );
}

function Boton({ children, onClick, disabled, variante = 'primary', tipo = 'button', estilo = {} }) {
  const baseStyle = {
    padding: '10px 20px',
    fontSize: 14,
    fontWeight: 500,
    borderRadius: 4,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'all 0.15s ease',
    fontFamily: 'inherit',
    minWidth: 100,
    ...estilo,
  };
  const variantes = {
    primary: { background: C.acento, color: '#fff', border: 'none' },
    ghost: { background: 'transparent', color: C.texto, border: `0.5px solid ${C.borde}` },
    secondary: { background: C.card, color: C.texto, border: `0.5px solid ${C.bordeFuerte}` },
    danger: { background: 'transparent', color: C.error, border: `0.5px solid ${C.error}` },
  };
  return (
    <button type={tipo} onClick={onClick} disabled={disabled} style={{ ...baseStyle, ...variantes[variante] }}>
      {children}
    </button>
  );
}

function Campo({ label, requerido, hint, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12, color: C.textoSuave, marginBottom: 6, letterSpacing: '0.02em' }}>
        {label}{requerido && <span style={{ color: C.error, marginLeft: 4 }}>*</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: 11, color: C.textoSuave, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '10px 12px', fontSize: 14,
  border: HAIRLINE, borderRadius: 4, background: C.card, color: C.texto,
  fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
};

function Input({ ...props }) {
  return <input style={inputStyle} {...props} />;
}

function Select({ children, ...props }) {
  return <select style={inputStyle} {...props}>{children}</select>;
}

function TextArea({ ...props }) {
  return <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} {...props} />;
}

function Fila2({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>{children}</div>;
}

function PiePagina() {
  return (
    <div style={{ textAlign: 'center', fontSize: 11, color: C.textoSuave, marginTop: 24, letterSpacing: '0.04em' }}>
      Plataforma legal · LexDocs
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Paso 1 — Bienvenida + autorización tratamiento de datos
// ──────────────────────────────────────────────────────────────

function Paso1Bienvenida({ d, upd, inst }) {
  return (
    <>
      <h2 style={{ fontWeight: 500, fontSize: 22, marginBottom: 8 }}>Bienvenido</h2>
      <p style={{ color: C.textoSuave, lineHeight: 1.6, marginBottom: 16 }}>
        {inst?.nombre || 'Su banco'} le invita a completar los datos necesarios para preparar su contrato. El proceso toma alrededor de diez minutos.
      </p>
      <p style={{ color: C.textoSuave, lineHeight: 1.6, marginBottom: 24 }}>
        Va a necesitar a la mano: una fotografía de su DPI y un recibo de servicios reciente para verificar su domicilio.
      </p>

      <div style={{ background: C.acentoSuave, border: HAIRLINE, borderRadius: 6, padding: 16, marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, letterSpacing: '0.02em' }}>Autorización de tratamiento de datos</h3>
        <p style={{ fontSize: 13, color: C.textoSuave, lineHeight: 1.6, marginBottom: 14 }}>
          Al continuar, usted autoriza a {inst?.nombre || 'su banco'} a recopilar, procesar y almacenar los datos que proporcionará en este formulario con el fin exclusivo de preparar el contrato solicitado. Sus datos serán protegidos conforme a la ley aplicable.
        </p>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={d.autorizo_tratamiento}
            onChange={(e) => upd({ autorizo_tratamiento: e.target.checked })}
            style={{ marginTop: 3, accentColor: C.acento }}
          />
          <span style={{ fontSize: 13, lineHeight: 1.55 }}>Autorizo el tratamiento de mis datos personales conforme a lo anterior.</span>
        </label>
      </div>
    </>
  );
}

// ──────────────────────────────────────────────────────────────
// Paso 2 — DPI (frente + reverso) → OCR
// ──────────────────────────────────────────────────────────────

function Paso2DPI({ d, upd, onScan }) {
  const [resFrente, setResFrente] = useState(null);
  const [resReverso, setResReverso] = useState(null);
  const [cargando, setCargando] = useState(null);
  const [errLocal, setErrLocal] = useState(null);

  const handleScan = async (file, lado) => {
    if (!file) return;
    setCargando(lado); setErrLocal(null);
    try {
      const r = await onScan(file, lado);
      if (lado === 'frente') setResFrente(r);
      else setResReverso(r);
    } catch (e) {
      setErrLocal(e.response?.data?.error || 'No pudimos procesar la foto. Intente con otra.');
    } finally {
      setCargando(null);
    }
  };

  return (
    <>
      <h2 style={{ fontWeight: 500, fontSize: 22, marginBottom: 8 }}>Su documento de identificación</h2>
      <p style={{ color: C.textoSuave, lineHeight: 1.6, marginBottom: 20 }}>
        Cargue una fotografía clara del frente y del reverso de su DPI. Puede tomarla en el momento o subir una imagen guardada.
      </p>

      <Fila2>
        <ZonaFoto label="Frente del DPI" cargando={cargando === 'frente'} subido={!!d.dpi_scan_frente} resultado={resFrente} onFile={(f) => handleScan(f, 'frente')} />
        <ZonaFoto label="Reverso del DPI" cargando={cargando === 'reverso'} subido={!!d.dpi_scan_reverso} resultado={resReverso} onFile={(f) => handleScan(f, 'reverso')} />
      </Fila2>

      {errLocal && <Alerta tipo="error" texto={errLocal} />}
      {resFrente?.warning && <Alerta tipo="alerta" texto={resFrente.warning} />}

      <div style={{ marginTop: 22, padding: '16px 0', borderTop: HAIRLINE }}>
        <p style={{ fontSize: 13, color: C.textoSuave, marginBottom: 14 }}>
          Estos datos fueron extraídos automáticamente. Revíselos y corrija lo que sea necesario.
        </p>
        <Campo label="Número de DPI" requerido hint="13 dígitos sin guiones o con espacios">
          <Input value={d.dpi} onChange={(e) => upd({ dpi: e.target.value })} inputMode="numeric" />
        </Campo>
        <Campo label="Nombre completo" requerido>
          <Input value={d.nombre} onChange={(e) => upd({ nombre: e.target.value })} />
        </Campo>
        <Fila2>
          <Campo label="Fecha de nacimiento" requerido>
            <Input type="date" value={d.fecha_nac} onChange={(e) => upd({ fecha_nac: e.target.value })} />
          </Campo>
          <Campo label="Lugar de nacimiento">
            <Input value={d.lugar_nac} onChange={(e) => upd({ lugar_nac: e.target.value })} placeholder="Ciudad, departamento" />
          </Campo>
        </Fila2>
      </div>
    </>
  );
}

function ZonaFoto({ label, onFile, cargando, subido, resultado }) {
  return (
    <label style={{
      display: 'block',
      border: `1px dashed ${subido ? C.bordeFuerte : C.borde}`,
      borderRadius: 6,
      padding: 20,
      textAlign: 'center',
      cursor: cargando ? 'wait' : 'pointer',
      background: subido ? C.acentoSuave : 'transparent',
      transition: 'all 0.2s ease',
    }}>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{label}</div>
      {cargando ? (
        <div style={{ padding: '8px 0' }}><Spinner /></div>
      ) : subido ? (
        <div style={{ fontSize: 12, color: C.exito }}>Fotografía cargada {resultado?.confidence != null && `· ${resultado.confidence}% legible`}</div>
      ) : (
        <div style={{ fontSize: 12, color: C.textoSuave }}>Toque para tomar o subir foto</div>
      )}
      <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} disabled={cargando} />
    </label>
  );
}

function Alerta({ tipo = 'alerta', texto }) {
  const colores = {
    error: { bg: '#fce8e8', border: C.error, text: C.error },
    alerta: { bg: '#fdf2dc', border: C.alerta, text: C.alerta },
    info: { bg: C.acentoSuave, border: C.bordeFuerte, text: C.texto },
  }[tipo];
  return (
    <div style={{ background: colores.bg, border: `0.5px solid ${colores.border}`, borderRadius: 4, padding: '10px 14px', marginTop: 12, fontSize: 13, color: colores.text, lineHeight: 1.5 }}>
      {texto}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Paso 3 — Datos personales
// ──────────────────────────────────────────────────────────────

function Paso3Personales({ d, upd }) {
  const edad = useMemo(() => calcularEdad(d.fecha_nac), [d.fecha_nac]);
  return (
    <>
      <h2 style={{ fontWeight: 500, fontSize: 22, marginBottom: 8 }}>Sus datos personales</h2>
      <p style={{ color: C.textoSuave, lineHeight: 1.6, marginBottom: 20 }}>
        Complete la información que falta. Todos los campos marcados con asterisco son obligatorios.
      </p>

      {edad != null && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: C.acentoSuave, borderRadius: 4, fontSize: 13 }}>
          Edad calculada: <strong>{edad} años</strong>
        </div>
      )}

      <Fila2>
        <Campo label="Género" requerido>
          <Select value={d.genero} onChange={(e) => upd({ genero: e.target.value })}>
            <option value="">Seleccione</option>
            <option value="masculino">Masculino</option>
            <option value="femenino">Femenino</option>
          </Select>
        </Campo>
        <Campo label="Estado civil" requerido>
          <Select value={d.estado_civil} onChange={(e) => upd({ estado_civil: e.target.value })}>
            <option value="">Seleccione</option>
            <option value="soltero">Soltero/a</option>
            <option value="casado">Casado/a</option>
            <option value="union_de_hecho">Unión de hecho</option>
            <option value="divorciado">Divorciado/a</option>
            <option value="viudo">Viudo/a</option>
          </Select>
        </Campo>
      </Fila2>

      {(d.estado_civil === 'casado' || d.estado_civil === 'union_de_hecho') && (
        <Fila2>
          <Campo label="Nombre del cónyuge">
            <Input value={d.conyuge_nombre} onChange={(e) => upd({ conyuge_nombre: e.target.value })} />
          </Campo>
          <Campo label="DPI del cónyuge">
            <Input value={d.conyuge_dpi} onChange={(e) => upd({ conyuge_dpi: e.target.value })} />
          </Campo>
        </Fila2>
      )}

      <Fila2>
        <Campo label="Profesión u oficio">
          <Input value={d.profesion} onChange={(e) => upd({ profesion: e.target.value })} placeholder="Ej. comerciante" />
        </Campo>
        <Campo label="NIT" hint="Si lo tiene a la mano">
          <Input value={d.nit} onChange={(e) => upd({ nit: e.target.value })} />
        </Campo>
      </Fila2>

      <Fila2>
        <Campo label="Teléfono">
          <Input value={d.telefono} onChange={(e) => upd({ telefono: e.target.value })} inputMode="tel" />
        </Campo>
        <Campo label="Correo electrónico">
          <Input value={d.email} onChange={(e) => upd({ email: e.target.value })} type="email" />
        </Campo>
      </Fila2>

      <Fila2>
        <Campo label="Ingresos mensuales (Q)">
          <Input value={d.ingresos} onChange={(e) => upd({ ingresos: e.target.value })} inputMode="decimal" placeholder="0.00" />
        </Campo>
        <Campo label="Empleo actual o negocio">
          <Input value={d.empleo} onChange={(e) => upd({ empleo: e.target.value })} placeholder="Nombre del patrono o negocio" />
        </Campo>
      </Fila2>
    </>
  );
}

function calcularEdad(fechaNac) {
  if (!fechaNac) return null;
  const f = new Date(fechaNac);
  if (Number.isNaN(f.getTime())) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - f.getFullYear();
  const m = hoy.getMonth() - f.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < f.getDate())) edad--;
  return edad >= 0 ? edad : null;
}

// ──────────────────────────────────────────────────────────────
// Paso 4 — Domicilio (recibo de servicios)
// ──────────────────────────────────────────────────────────────

function Paso4Domicilio({ d, upd, onScan }) {
  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [errLocal, setErrLocal] = useState(null);

  const handleScan = async (file) => {
    if (!file) return;
    setCargando(true); setErrLocal(null);
    try {
      const r = await onScan(file);
      setResultado(r);
    } catch (e) {
      setErrLocal(e.response?.data?.error || 'No pudimos procesar la foto. Intente con otra.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <>
      <h2 style={{ fontWeight: 500, fontSize: 22, marginBottom: 8 }}>Su domicilio</h2>
      <p style={{ color: C.textoSuave, lineHeight: 1.6, marginBottom: 20 }}>
        Cargue una fotografía de un recibo reciente (luz, agua, teléfono o cable) para verificar su dirección. Si prefiere, puede escribirla directamente más abajo.
      </p>

      <ZonaFoto label="Recibo de servicios" cargando={cargando} subido={!!d.recibo_path} resultado={resultado} onFile={handleScan} />

      {errLocal && <Alerta tipo="error" texto={errLocal} />}
      {resultado?.warning && <Alerta tipo="alerta" texto={resultado.warning} />}
      {resultado?.comprobante && !resultado.warning && (
        <Alerta tipo="info" texto={`Recibo identificado: ${resultado.comprobante}.`} />
      )}

      <div style={{ marginTop: 22, padding: '16px 0', borderTop: HAIRLINE }}>
        <Campo label="Dirección completa" requerido hint="Calle, avenida, número de casa, zona, municipio">
          <TextArea value={d.domicilio} onChange={(e) => upd({ domicilio: e.target.value })} rows={3} />
        </Campo>
      </div>
    </>
  );
}

// ──────────────────────────────────────────────────────────────
// Paso 5 — Fiadores (opcional)
// ──────────────────────────────────────────────────────────────

function Paso5Fiadores({ d, upd }) {
  const fiadores = d.fiadores || [];

  const updFiador = (idx, parche) => {
    const nuevos = [...fiadores];
    nuevos[idx] = { ...nuevos[idx], ...parche };
    upd({ fiadores: nuevos });
  };

  const eliminar = (idx) => {
    if (!confirm('¿Eliminar este fiador?')) return;
    upd({ fiadores: fiadores.filter((_, i) => i !== idx) });
  };

  const agregar = () => upd({ fiadores: [...fiadores, FIADOR_VACIO()] });

  return (
    <>
      <h2 style={{ fontWeight: 500, fontSize: 22, marginBottom: 8 }}>Fiadores</h2>
      <p style={{ color: C.textoSuave, lineHeight: 1.6, marginBottom: 20 }}>
        Si va a presentar uno o más fiadores, agréguelos aquí. Si no aplica, puede saltar este paso.
      </p>

      {fiadores.length === 0 && (
        <div style={{ textAlign: 'center', padding: '24px 16px', background: C.acentoSuave, border: HAIRLINE, borderRadius: 6 }}>
          <p style={{ color: C.textoSuave, marginBottom: 14 }}>No ha agregado fiadores aún.</p>
          <Boton variante="secondary" onClick={agregar}>Agregar fiador</Boton>
        </div>
      )}

      {fiadores.map((f, idx) => (
        <FiadorCard key={f.id} fiador={f} indice={idx} onChange={(p) => updFiador(idx, p)} onDelete={() => eliminar(idx)} />
      ))}

      {fiadores.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Boton variante="ghost" onClick={agregar}>Agregar otro fiador</Boton>
        </div>
      )}
    </>
  );
}

function FiadorCard({ fiador, indice, onChange, onDelete }) {
  return (
    <div style={{ border: HAIRLINE, borderRadius: 6, padding: 18, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 10, borderBottom: HAIRLINE }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Fiador {indice + 1}</span>
        <Boton variante="danger" onClick={onDelete} estilo={{ minWidth: 0, padding: '6px 12px', fontSize: 12 }}>Eliminar</Boton>
      </div>

      <Fila2>
        <Campo label="Nombre completo" requerido>
          <Input value={fiador.nombre} onChange={(e) => onChange({ nombre: e.target.value })} />
        </Campo>
        <Campo label="DPI" requerido>
          <Input value={fiador.dpi} onChange={(e) => onChange({ dpi: e.target.value })} inputMode="numeric" />
        </Campo>
      </Fila2>
      <Fila2>
        <Campo label="Teléfono">
          <Input value={fiador.telefono} onChange={(e) => onChange({ telefono: e.target.value })} inputMode="tel" />
        </Campo>
        <Campo label="Profesión u oficio">
          <Input value={fiador.profesion} onChange={(e) => onChange({ profesion: e.target.value })} />
        </Campo>
      </Fila2>

      <Campo label="Tipo de garantía del fiador">
        <Select value={fiador.tipo} onChange={(e) => onChange({ tipo: e.target.value })}>
          <option value="personal">Personal (solo fianza)</option>
          <option value="hipotecaria">Hipotecaria</option>
          <option value="prendaria">Prendaria</option>
        </Select>
      </Campo>

      {fiador.tipo === 'hipotecaria' && (
        <div style={{ background: C.acentoSuave, padding: 14, borderRadius: 4 }}>
          <Fila2>
            <Campo label="Finca No."><Input value={fiador.hipoteca?.finca || ''} onChange={(e) => onChange({ hipoteca: { ...fiador.hipoteca, finca: e.target.value } })} /></Campo>
            <Campo label="Folio"><Input value={fiador.hipoteca?.folio || ''} onChange={(e) => onChange({ hipoteca: { ...fiador.hipoteca, folio: e.target.value } })} /></Campo>
          </Fila2>
          <Fila2>
            <Campo label="Libro"><Input value={fiador.hipoteca?.libro || ''} onChange={(e) => onChange({ hipoteca: { ...fiador.hipoteca, libro: e.target.value } })} /></Campo>
            <Campo label="Municipio"><Input value={fiador.hipoteca?.municipio || ''} onChange={(e) => onChange({ hipoteca: { ...fiador.hipoteca, municipio: e.target.value } })} /></Campo>
          </Fila2>
        </div>
      )}

      {fiador.tipo === 'prendaria' && (
        <div style={{ background: C.acentoSuave, padding: 14, borderRadius: 4 }}>
          <Fila2>
            <Campo label="Tipo de bien"><Input value={fiador.prenda?.tipo_bien || ''} onChange={(e) => onChange({ prenda: { ...fiador.prenda, tipo_bien: e.target.value } })} placeholder="Vehículo, maquinaria…" /></Campo>
            <Campo label="Marca"><Input value={fiador.prenda?.marca || ''} onChange={(e) => onChange({ prenda: { ...fiador.prenda, marca: e.target.value } })} /></Campo>
          </Fila2>
          <Fila2>
            <Campo label="Serie / VIN"><Input value={fiador.prenda?.serie || ''} onChange={(e) => onChange({ prenda: { ...fiador.prenda, serie: e.target.value } })} /></Campo>
            <Campo label="Placa"><Input value={fiador.prenda?.placa || ''} onChange={(e) => onChange({ prenda: { ...fiador.prenda, placa: e.target.value } })} /></Campo>
          </Fila2>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Paso 6 — Garantía (según tipo del contrato)
// ──────────────────────────────────────────────────────────────

function Paso6Garantia({ d, upd, tipo }) {
  if (tipo === 'personal' || !tipo) {
    return (
      <>
        <h2 style={{ fontWeight: 500, fontSize: 22, marginBottom: 8 }}>Garantía</h2>
        <p style={{ color: C.textoSuave, lineHeight: 1.6 }}>
          Este contrato no requiere garantía real adicional. Puede continuar al paso final.
        </p>
      </>
    );
  }

  const g = d.garantia || { hipoteca: {}, prenda: {} };

  if (tipo === 'hipotecaria' || tipo === 'mixta') {
    return (
      <>
        <h2 style={{ fontWeight: 500, fontSize: 22, marginBottom: 8 }}>Garantía hipotecaria</h2>
        <p style={{ color: C.textoSuave, lineHeight: 1.6, marginBottom: 20 }}>
          Indique los datos del inmueble que ofrecerá como garantía. Si aún no tiene todos los detalles, complete lo que sepa y el banco verificará el resto.
        </p>
        <Fila2>
          <Campo label="Finca No."><Input value={g.hipoteca?.finca || ''} onChange={(e) => upd({ garantia: { ...g, hipoteca: { ...g.hipoteca, finca: e.target.value } } })} /></Campo>
          <Campo label="Folio"><Input value={g.hipoteca?.folio || ''} onChange={(e) => upd({ garantia: { ...g, hipoteca: { ...g.hipoteca, folio: e.target.value } } })} /></Campo>
        </Fila2>
        <Fila2>
          <Campo label="Libro"><Input value={g.hipoteca?.libro || ''} onChange={(e) => upd({ garantia: { ...g, hipoteca: { ...g.hipoteca, libro: e.target.value } } })} /></Campo>
          <Campo label="Municipio"><Input value={g.hipoteca?.municipio || ''} onChange={(e) => upd({ garantia: { ...g, hipoteca: { ...g.hipoteca, municipio: e.target.value } } })} /></Campo>
        </Fila2>
        <Campo label="Dirección del inmueble">
          <TextArea value={g.hipoteca?.direccion || ''} onChange={(e) => upd({ garantia: { ...g, hipoteca: { ...g.hipoteca, direccion: e.target.value } } })} rows={2} />
        </Campo>
      </>
    );
  }

  if (tipo === 'prendaria') {
    return (
      <>
        <h2 style={{ fontWeight: 500, fontSize: 22, marginBottom: 8 }}>Garantía prendaria</h2>
        <p style={{ color: C.textoSuave, lineHeight: 1.6, marginBottom: 20 }}>
          Indique los datos del bien mueble que ofrecerá como garantía. Si es vehículo, incluya placa, serie y motor.
        </p>
        <Campo label="Tipo de bien">
          <Input value={g.prenda?.tipo_bien || ''} onChange={(e) => upd({ garantia: { ...g, prenda: { ...g.prenda, tipo_bien: e.target.value } } })} placeholder="Vehículo, maquinaria, otro…" />
        </Campo>
        <Fila2>
          <Campo label="Marca"><Input value={g.prenda?.marca || ''} onChange={(e) => upd({ garantia: { ...g, prenda: { ...g.prenda, marca: e.target.value } } })} /></Campo>
          <Campo label="Modelo"><Input value={g.prenda?.modelo || ''} onChange={(e) => upd({ garantia: { ...g, prenda: { ...g.prenda, modelo: e.target.value } } })} /></Campo>
        </Fila2>
        <Fila2>
          <Campo label="Serie / VIN"><Input value={g.prenda?.serie || ''} onChange={(e) => upd({ garantia: { ...g, prenda: { ...g.prenda, serie: e.target.value } } })} /></Campo>
          <Campo label="Placa"><Input value={g.prenda?.placa || ''} onChange={(e) => upd({ garantia: { ...g, prenda: { ...g.prenda, placa: e.target.value } } })} /></Campo>
        </Fila2>
      </>
    );
  }

  return null;
}

// ──────────────────────────────────────────────────────────────
// Paso 7 — Confirmación + envío
// ──────────────────────────────────────────────────────────────

function Paso7Confirmar({ d, upd, enviar, enviando, error }) {
  return (
    <>
      <h2 style={{ fontWeight: 500, fontSize: 22, marginBottom: 8 }}>Resumen y confirmación</h2>
      <p style={{ color: C.textoSuave, lineHeight: 1.6, marginBottom: 20 }}>
        Revise sus datos antes de enviarlos al banco. Si necesita corregir algo, use el botón Atrás.
      </p>

      <Resumen d={d} />

      <div style={{ marginTop: 20, padding: '16px 0', borderTop: HAIRLINE }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={d.datos_veridicos} onChange={(e) => upd({ datos_veridicos: e.target.checked })} style={{ marginTop: 3, accentColor: C.acento }} />
          <span style={{ fontSize: 13, lineHeight: 1.55 }}>Declaro que los datos proporcionados son verídicos y completos.</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16, cursor: 'pointer' }}>
          <input type="checkbox" checked={d.autorizo_referencias} onChange={(e) => upd({ autorizo_referencias: e.target.checked })} style={{ marginTop: 3, accentColor: C.acento }} />
          <span style={{ fontSize: 13, lineHeight: 1.55 }}>Autorizo la verificación de mis referencias laborales, personales y crediticias.</span>
        </label>
      </div>

      {error && <Alerta tipo="error" texto={error} />}

      <div style={{ textAlign: 'center', marginTop: 18 }}>
        <Boton variante="primary" onClick={enviar} disabled={!d.datos_veridicos || !d.autorizo_referencias || enviando} estilo={{ padding: '14px 36px', fontSize: 15 }}>
          {enviando ? 'Enviando…' : 'Enviar al banco'}
        </Boton>
      </div>
    </>
  );
}

function Resumen({ d }) {
  const filas = [
    ['Nombre', d.nombre],
    ['DPI', d.dpi],
    ['Fecha de nacimiento', d.fecha_nac],
    ['Género', d.genero],
    ['Estado civil', d.estado_civil],
    ['Profesión', d.profesion],
    ['Teléfono', d.telefono],
    ['Correo', d.email],
    ['Ingresos mensuales', d.ingresos ? `Q ${d.ingresos}` : ''],
    ['Empleo', d.empleo],
    ['Domicilio', d.domicilio],
    ['Fiadores', d.fiadores?.length ? `${d.fiadores.length} fiador(es) registrados` : 'Ninguno'],
  ];
  return (
    <div style={{ background: C.acentoSuave, border: HAIRLINE, borderRadius: 4, padding: '14px 18px' }}>
      {filas.map(([k, v]) => (
        <div key={k} style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12, padding: '6px 0', borderBottom: HAIRLINE, fontSize: 13 }}>
          <span style={{ color: C.textoSuave, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k}</span>
          <span style={{ wordBreak: 'break-word' }}>{v || <em style={{ color: C.textoSuave }}>—</em>}</span>
        </div>
      ))}
    </div>
  );
}
