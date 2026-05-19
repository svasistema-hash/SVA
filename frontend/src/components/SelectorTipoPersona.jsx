import { useEffect } from 'react';
import { Building2, User, X } from 'lucide-react';

// F6.C — Modal selector de tipo de persona.
// Props:
//   onClose()      — cierra el modal sin seleccionar.
//   onSelect(tipo) — tipo es 'individual' o 'juridica'.
export default function SelectorTipoPersona({ onClose, onSelect }) {
  // Cerrar con Escape.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const cardBase = {
    border: '0.5px solid var(--border-mid)',
    borderRadius: 8,
    padding: '24px 18px',
    background: 'var(--bg-card)',
    cursor: 'pointer',
    transition: 'background 0.15s ease, border-color 0.15s ease',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: 10,
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Seleccionar tipo de cliente"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(17,19,24,0.45)',
        display: 'grid', placeItems: 'center',
        zIndex: 1000, padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 500, maxWidth: '95vw',
          background: 'var(--bg-card)',
          borderRadius: 10,
          padding: '24px 28px 22px',
          boxShadow: 'var(--shadow-lg)',
          border: '0.5px solid var(--border-light)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
          <div>
            <h2 style={{
              fontFamily: "'Libre Baskerville', Georgia, serif",
              fontWeight: 400, fontSize: 18,
              margin: 0, color: 'var(--text-primary)',
            }}>Nuevo cliente</h2>
            <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 4 }}>
              Seleccione el tipo de persona
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-tertiary)', padding: 4, display: 'flex',
            }}
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 18 }}>
          <button
            type="button"
            style={cardBase}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-subtle)'; e.currentTarget.style.borderColor = 'var(--border-dark)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.borderColor = 'var(--border-mid)'; }}
            onClick={() => onSelect('individual')}
          >
            <User size={36} strokeWidth={1.25} color="var(--text-secondary)" />
            <div style={{
              fontFamily: "'Libre Baskerville', Georgia, serif",
              fontSize: 15, color: 'var(--text-primary)',
            }}>Individual</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', lineHeight: 1.45 }}>
              Persona natural identificada por DPI
            </div>
          </button>

          <button
            type="button"
            style={cardBase}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-subtle)'; e.currentTarget.style.borderColor = 'var(--border-dark)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.borderColor = 'var(--border-mid)'; }}
            onClick={() => onSelect('juridica')}
          >
            <Building2 size={36} strokeWidth={1.25} color="var(--text-secondary)" />
            <div style={{
              fontFamily: "'Libre Baskerville', Georgia, serif",
              fontSize: 15, color: 'var(--text-primary)',
            }}>Jurídico</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', lineHeight: 1.45 }}>
              Sociedad mercantil, cooperativa, asociación
            </div>
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 22 }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
