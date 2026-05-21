// Footer pequeño con build del frontend + commit del backend.
// Útil para confirmar que un deploy se aplicó correctamente.

import { useEffect, useState } from 'react';
import client from '../api/client';

// Inyectado por vite.config.js (process.env.VITE_BUILD_TAG) o por la env de
// Vercel directamente (VITE_BUILD_TAG). Vite reemplaza estos accesos en
// build time con el string del valor.
const FRONTEND_BUILD = import.meta.env.VITE_BUILD_TAG || 'dev';
const FRONTEND_TIME = import.meta.env.VITE_BUILD_TIME || '';

export default function VersionFooter() {
  const [backend, setBackend] = useState(null);

  useEffect(() => {
    client.get('/version')
      .then((r) => setBackend(r.data))
      .catch(() => setBackend({ commit: 'offline' }));
  }, []);

  const styles = {
    position: 'fixed',
    bottom: 4,
    right: 8,
    fontSize: 10,
    color: '#666',
    background: 'rgba(255,255,255,0.9)',
    padding: '2px 8px',
    borderRadius: 3,
    letterSpacing: '0.04em',
    fontFamily: 'monospace',
    zIndex: 1000,
    pointerEvents: 'none',
    border: '0.5px solid rgba(0,0,0,0.06)',
  };

  return (
    <div style={styles} title={`Frontend build: ${FRONTEND_TIME}\nBackend: ${backend?.built_at || '?'}`}>
      ui:{FRONTEND_BUILD} · api:{backend?.commit || '…'}
    </div>
  );
}
