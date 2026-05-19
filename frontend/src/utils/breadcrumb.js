const TIPO_LABEL = {
  banco: 'Bancos',
  financiera: 'Financieras',
  desarrolladora: 'Desarrolladoras',
  prestamista: 'Prestamistas',
};

export function tenantBreadcrumb(inst, ...crumbs) {
  const segs = [
    { label: 'LexDocs', to: '/' },
    { label: TIPO_LABEL[inst?.tipo] || 'Instituciones', to: `/instituciones?tipo=${inst?.tipo || ''}` },
    { label: inst?.nombre || '—', to: `/instituciones/${inst?.slug}` },
  ];
  crumbs.filter(Boolean).forEach((c) => segs.push({ label: c }));
  return segs;
}
