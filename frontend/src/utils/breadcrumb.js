const TIPO_LABEL = {
  banco: 'Bancos',
  financiera: 'Financieras',
  desarrolladora: 'Desarrolladoras',
  prestamista: 'Prestamistas',
};

export function tenantBreadcrumb(inst, current) {
  const segs = [
    { label: 'LexDocs', to: '/' },
    { label: TIPO_LABEL[inst?.tipo] || 'Instituciones', to: `/instituciones?tipo=${inst?.tipo || ''}` },
    { label: inst?.nombre || '—', to: `/instituciones/${inst?.slug}` },
  ];
  if (current) segs.push({ label: current });
  return segs;
}
