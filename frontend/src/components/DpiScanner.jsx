import { useRef, useState } from 'react';
import { scanDpi, scanRecibo } from '../api/contratos';

export default function DpiScanner({ mode = 'dpi', onResult, label, hint }) {
  const ref = useRef(null);
  const [loading, setLoading] = useState(false);
  const [filename, setFilename] = useState(null);
  const [error, setError] = useState(null);

  const defaultLabel = mode === 'dpi' ? 'Escanear DPI' : 'Escanear recibo';
  const defaultHint = mode === 'dpi'
    ? 'Cargue la foto del Documento Personal de Identificación'
    : 'Cargue la foto del recibo de servicio (luz, agua, etc.)';

  const onChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    setFilename(file.name);
    try {
      const fn = mode === 'dpi' ? scanDpi : scanRecibo;
      const data = await fn(file);
      onResult?.(data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Error al escanear');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <label
        className={'scanner' + (filename ? ' has-file' : '')}
        style={{ display: 'block' }}
      >
        <div className="ico">{mode === 'dpi' ? 'DPI' : 'Rb'}</div>
        <div className="lbl">{label || defaultLabel}</div>
        <div className="hint">
          {loading ? (
            <>
              <span className="spinner" /> Procesando…
            </>
          ) : filename ? (
            `Archivo: ${filename}`
          ) : (
            hint || defaultHint
          )}
        </div>
        <input ref={ref} type="file" accept="image/*" onChange={onChange} />
      </label>
      {error && <div className="field-error" style={{ marginTop: 6 }}>{error}</div>}
    </div>
  );
}
