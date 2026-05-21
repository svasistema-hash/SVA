// Footer pequeño con build del frontend + commit del backend.
// Útil para confirmar que un deploy se aplicó correctamente.
// Se monta en Login y en TenantLayout.

import { useEffect, useState } from 'react';
import client from '../api/client';

// Inyectado por vite.config.js (define).
// eslint-disable-next-line no-undef
const FRONTEND_BUILD = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
// eslint-disable-next-line no-undef
const FRONTEND_TIME = typeof __APP_BUILT_AT__ !== 'undefined' ? __APP_BUILT_AT__ : '';

export default function VersionFooter({ position = 'bottom-right' }) {
  const [backend, setBackend] = useState(null);

  useEffect(() => {
    client.get('/version')
      .then((r) => setBackend(r.data))
      .catch(() => setBackend({ commit: 'offline' }));
  }, []);

  const styles = position === 'inline'
    ? { fontSize: 10, color: 'var(--text-dim, #888)', letterSpacing: '0.04em', padding: '8px 12px', textAlign: 'center' }
    : {
        position: 'fixed',
        bottom: 4,
        right: 8,
        fontSize: 10,
        color: 'var(--text-dim, #888)',
        background: 'rgba(255,255,255,0.85)',
        padding: '2px 8px',
        borderRadius: 3,
        letterSpacing: '0.04em',
        fontFamily: 'monospace',
        zIndex: 1000,
        pointerEvents: 'none',
      };

  return (
    <div style={styles} title={`Frontend build: ${FRONTEND_TIME}\nBackend: ${backend?.built_at || '?'}`}>
      ui:{FRONTEND_BUILD} · api:{backend?.commit || '…'}
    </div>
  );
}
