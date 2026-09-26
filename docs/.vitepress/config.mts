import { defineConfig, type DefaultTheme } from 'vitepress';

// Documentação do MagFEM. Publicada junto com o app em https://thalesmaia.com/tools/magfem-web/docs/
// (o CI copia .vitepress/dist para web/dist/docs antes de publicar a branch dist).
const APP = 'https://thalesmaia.com/tools/magfem-web/';
const REPO = 'https://github.com/thalesmaoa/magfem';

function sidebar(pt: boolean): DefaultTheme.Sidebar {
  const p = pt ? '' : '/en';
  return [
    {
      text: pt ? 'Guia' : 'Guide',
      items: [
        { text: pt ? 'Introdução' : 'Introduction', link: `${p}/guide/` },
        { text: pt ? 'Primeiro modelo' : 'First model', link: `${p}/guide/first-model` },
        { text: pt ? 'Geometria (CAD)' : 'Geometry (CAD)', link: `${p}/guide/geometry` },
        { text: pt ? 'Malha e materiais' : 'Mesh and materials', link: `${p}/guide/mesh` },
        { text: pt ? 'Resolução' : 'Solving', link: `${p}/guide/solver` },
        { text: pt ? 'Resultados' : 'Results', link: `${p}/guide/results` },
        { text: pt ? 'Circuito externo' : 'External circuit', link: `${p}/guide/circuit` },
        { text: pt ? 'Arquivos, importar e exportar' : 'Files, import and export', link: `${p}/guide/files` },
        { text: pt ? 'Atalhos de teclado' : 'Keyboard shortcuts', link: `${p}/guide/shortcuts` },
      ],
    },
    {
      text: pt ? 'Scripts e API' : 'Scripting and API',
      items: [
        { text: pt ? 'Console' : 'Console', link: `${p}/scripting/console` },
        { text: pt ? 'Referência da API' : 'API reference', link: `${p}/scripting/api` },
        { text: pt ? 'Ponte local (Python)' : 'Local bridge (Python)', link: `${p}/scripting/bridge` },
        { text: pt ? 'Matlab, Julia e HTTP' : 'Matlab, Julia and HTTP', link: `${p}/scripting/other-languages` },
        { text: pt ? 'Exemplos' : 'Examples', link: `${p}/scripting/examples` },
      ],
    },
    {
      text: pt ? 'Teoria' : 'Theory',
      items: [
        { text: pt ? 'Formulação' : 'Formulation', link: `${p}/theory/formulation` },
        { text: pt ? 'Validação' : 'Validation', link: `${p}/theory/validation` },
      ],
    },
    {
      text: pt ? 'Sobre' : 'About',
      items: [
        { text: pt ? 'Citar' : 'Cite', link: `${p}/about/cite` },
        { text: pt ? 'Licença e créditos' : 'License and credits', link: `${p}/about/license` },
        { text: pt ? 'Contribuir' : 'Contributing', link: `${p}/about/contributing` },
      ],
    },
  ];
}

function nav(pt: boolean): DefaultTheme.NavItem[] {
  const p = pt ? '' : '/en';
  return [
    { text: pt ? 'Guia' : 'Guide', link: `${p}/guide/`, activeMatch: `${p}/guide/` },
    { text: 'API', link: `${p}/scripting/api`, activeMatch: `${p}/scripting/` },
    { text: pt ? 'Teoria' : 'Theory', link: `${p}/theory/formulation`, activeMatch: `${p}/theory/` },
    { text: pt ? 'Abrir o MagFEM' : 'Open MagFEM', link: APP },
  ];
}

export default defineConfig({
  base: '/tools/magfem-web/docs/',
  title: 'MagFEM',
  cleanUrls: false,
  markdown: { math: true },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/tools/magfem-web/docs/logo.svg' }],
    ['meta', { property: 'og:image', content: 'https://thalesmaia.com/tools/magfem-web/docs/logo.png' }],
  ],
  locales: {
    root: {
      label: 'Português',
      lang: 'pt-BR',
      description: 'Documentação do MagFEM: elementos finitos magnéticos 2D no navegador.',
      themeConfig: {
        nav: nav(true),
        sidebar: sidebar(true),
        outline: { level: [2, 3], label: 'Nesta página' },
        docFooter: { prev: 'Anterior', next: 'Próxima' },
        editLink: { pattern: `${REPO}/edit/main/docs/:path`, text: 'Editar esta página no GitHub' },
        darkModeSwitchLabel: 'Tema',
        sidebarMenuLabel: 'Menu',
        returnToTopLabel: 'Voltar ao topo',
        langMenuLabel: 'Idioma',
        footer: { message: 'Código MIT · Biblioteca de materiais do FEMM 4.2 (AFPL)', copyright: '© 2026 Thales Maia' },
      },
    },
    en: {
      label: 'English',
      lang: 'en',
      link: '/en/',
      description: 'MagFEM documentation: 2D magnetic finite elements in the browser.',
      themeConfig: {
        nav: nav(false),
        sidebar: sidebar(false),
        outline: { level: [2, 3] },
        editLink: { pattern: `${REPO}/edit/main/docs/:path`, text: 'Edit this page on GitHub' },
        footer: { message: 'MIT code · FEMM 4.2 material library (AFPL)', copyright: '© 2026 Thales Maia' },
      },
    },
  },
  themeConfig: {
    logo: '/logo.svg',
    socialLinks: [{ icon: 'github', link: REPO }],
    search: {
      provider: 'local',
      options: {
        locales: {
          root: {
            translations: {
              button: { buttonText: 'Buscar', buttonAriaLabel: 'Buscar' },
              modal: {
                noResultsText: 'Nenhum resultado para',
                resetButtonTitle: 'Limpar a busca',
                footer: { selectText: 'selecionar', navigateText: 'navegar', closeText: 'fechar' },
              },
            },
          },
        },
      },
    },
  },
});
