// Dados da citação do MagFEM ("Cite este trabalho"). Ajuste aqui autor/título/versão.
export const CITATION = {
  authors: [{ family: 'Maia', given: 'Thales' }],
  /** Nome com a grafia exata (no BibTeX vai entre chaves para preservar maiúsculas). */
  name: 'MagFEM',
  subtitle: 'A Web-Based Magnetic Finite Element Analysis Tool',
  year: 2026,
  version: '0.2.0',
  url: 'https://thalesmaia.com/tools/magfem-web/',
  key: 'maia2026magfem',
};

/** Citação completa (formato ABNT para pt, APA para en), com data de acesso. */
export function fullCitation(lang: 'pt' | 'en', accessed = new Date()): string {
  const c = CITATION;
  const title = `${c.name}: ${c.subtitle}`;
  if (lang === 'pt') {
    const months = ['jan.', 'fev.', 'mar.', 'abr.', 'maio', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
    const auth = c.authors.map((a) => `${a.family.toUpperCase()}, ${a.given}`).join('; ');
    const d = `${accessed.getDate()} ${months[accessed.getMonth()]} ${accessed.getFullYear()}`;
    return `${auth}. ${title}. Versão ${c.version}. [S. l.], ${c.year}. Software. Disponível em: ${c.url}. Acesso em: ${d}.`;
  }
  const auth = c.authors.map((a) => `${a.family}, ${a.given[0]}.`).join(', ');
  const d = accessed.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  return `${auth} (${c.year}). ${title} (Version ${c.version}) [Computer software]. Retrieved ${d}, from ${c.url}`;
}

export function bibtex(accessed = new Date()): string {
  const c = CITATION;
  const iso = accessed.toISOString().slice(0, 10);
  return [
    `@software{${c.key},`,
    `  author  = {${c.authors.map((a) => `${a.family}, ${a.given}`).join(' and ')}},`,
    // Chaves duplas preservam as maiúsculas de MagFEM e do subtítulo em qualquer estilo BibTeX.
    `  title   = {{${c.name}}: {${c.subtitle}}},`,
    `  year    = {${c.year}},`,
    `  version = {${c.version}},`,
    `  url     = {${c.url}},`,
    `  urldate = {${iso}},`,
    `  note    = {Accessed: ${iso}}`,
    `}`,
  ].join('\n');
}
