// Ícones SVG simples (20×20, traço em currentColor).
import type { ReactNode } from 'react';

const S = ({ children }: { children: ReactNode }) => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const dot = (x: number, y: number) => <circle cx={x} cy={y} r="1.6" fill="currentColor" stroke="none" />;

export const Icons = {
  select: (
    <S>
      <path d="M5 3l10 6.5-4.5 1L8 15z" />
    </S>
  ),
  line: (
    <S>
      <path d="M4 16L16 4" />
      {dot(4, 16)}
      {dot(16, 4)}
    </S>
  ),
  trim: (
    // Tesoura (aparar).
    <S>
      <circle cx="5.5" cy="14.5" r="2.5" />
      <circle cx="14.5" cy="14.5" r="2.5" />
      <path d="M7.3 12.7L15 3M12.7 12.7L5 3" />
    </S>
  ),
  measure: (
    <S>
      <rect x="2" y="7" width="16" height="6" rx="1" transform="rotate(-30 10 10)" />
      <path d="M6.2 9.6l.9 1.5M9 8l.9 1.5M11.8 6.4l.9 1.5" />
    </S>
  ),
  cline: (
    <S>
      <path d="M4 16L16 4" strokeDasharray="2.5 2" />
      {dot(4, 16)}
      {dot(16, 4)}
    </S>
  ),
  origin: (
    <S>
      <circle cx="10" cy="10" r="2.5" fill="currentColor" />
      <path d="M10 2v5M10 13v5M2 10h5M13 10h5" />
    </S>
  ),
  constraints: (
    <S>
      <rect x="6" y="9" width="8" height="7" rx="1" />
      <path d="M7.5 9V6.5a2.5 2.5 0 0 1 5 0V9" />
      <path d="M2 4h3M15 4h3" />
    </S>
  ),
  variable: (
    <S>
      <text x="10" y="15" fontSize="15" fontStyle="italic" fontWeight="600" textAnchor="middle" fill="currentColor" stroke="none">x</text>
      <path d="M3.5 3c-2 2.5-2 11.5 0 14M16.5 3c2 2.5 2 11.5 0 14" />
    </S>
  ),
  rect: (
    <S>
      <rect x="3.5" y="5.5" width="13" height="9" />
    </S>
  ),
  rectc: (
    <S>
      <rect x="3.5" y="5.5" width="13" height="9" />
      <path d="M3.5 5.5l13 9M16.5 5.5l-13 9" strokeDasharray="1.5 2" strokeWidth="1" />
      {dot(10, 10)}
    </S>
  ),
  group: (
    <S>
      <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" strokeDasharray="2.5 2" />
      <rect x="5" y="6" width="5" height="4" />
      <circle cx="12.5" cy="12" r="2.5" />
    </S>
  ),
  ungroup: (
    <S>
      <rect x="3" y="4" width="6" height="5" />
      <circle cx="14" cy="13" r="3" />
      <path d="M11 4l6 0M3 16h5" strokeDasharray="1.5 2" />
    </S>
  ),
  eye: (
    <S>
      <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" />
      <circle cx="10" cy="10" r="2.3" />
    </S>
  ),
  eyeOff: (
    <S>
      <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" opacity=".45" />
      <path d="M3 17L17 3" />
    </S>
  ),
  move: (
    <S>
      <path d="M10 2v16M2 10h16" />
      <path d="M7.5 4.5L10 2l2.5 2.5M7.5 15.5L10 18l2.5-2.5M4.5 7.5L2 10l2.5 2.5M15.5 7.5L18 10l-2.5 2.5" />
    </S>
  ),
  solver: (
    <S>
      <circle cx="10" cy="10" r="3" />
      <path d="M10 2v3M10 15v3M2 10h3M15 10h3M4.3 4.3l2.1 2.1M13.6 13.6l2.1 2.1M4.3 15.7l2.1-2.1M13.6 6.4l2.1-2.1" />
    </S>
  ),
  treePre: (
    <S>
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <path d="M3 8h14" />
    </S>
  ),
  treeGeom: (
    <S>
      <path d="M4 16l3-1 9-9-2-2-9 9-1 3z" />
      <path d="M12 6l2 2" />
    </S>
  ),
  treePhysics: (
    // Ímã em ferradura (campo magnético).
    <S>
      <path d="M5 3v7a5 5 0 0 0 10 0V3" />
      <path d="M8 3v7a2 2 0 0 0 4 0V3" />
      <path d="M5 3h3M12 3h3" />
      <path d="M5 6h3M12 6h3" strokeWidth="2.4" />
    </S>
  ),
  treeMesh: (
    <S>
      <path d="M3 16L10 3l7 13z" />
      <path d="M6.5 9.5h7M10 16l-3.5-6.5M10 16l3.5-6.5" />
    </S>
  ),
  material: (
    <S>
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="11" y="3" width="6" height="6" rx="1" />
      <rect x="3" y="11" width="6" height="6" rx="1" />
      <rect x="11" y="11" width="6" height="6" rx="1" />
    </S>
  ),
  rotate: (
    <S>
      <path d="M15.5 9A5.5 5.5 0 1 1 13 4.4" />
      <path d="M13.5 1.5l0 3.2l-3.2 0" />
    </S>
  ),
  importFile: (
    // Seta entrando numa bandeja (importar DXF/SVG).
    <S>
      <path d="M10 3v9" />
      <path d="M6.5 8.5L10 12l3.5-3.5" />
      <path d="M4 12v4h12v-4" />
    </S>
  ),
  github: (
    // Marca do GitHub (octocat), preenchida.
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  ),
  physicsCircuit: (
    // Ímã em ferradura ligado a uma fonte senoidal (campo magnético + circuito).
    <S>
      <path d="M2 3v5.5a3.5 3.5 0 0 0 7 0V3" />
      <path d="M4.5 3v5.5a1 1 0 0 0 2 0V3" />
      <path d="M2 5h2.5M6.5 5H9" strokeWidth="2.2" />
      <circle cx="14.5" cy="12.5" r="4" />
      <path d="M12.5 12.5q1 -2 2 0t2 0" />
      <path d="M9 3h5.5v5.5M5.5 12v6.5h9v-2" />
    </S>
  ),
  source: (
    // Fonte senoidal (círculo com ~).
    <S>
      <circle cx="10" cy="10" r="6.5" />
      <path d="M6.5 10q1.75 -3.5 3.5 0t3.5 0" />
      <path d="M10 1v2.5M10 16.5V19" />
    </S>
  ),
  circuit: (
    // Bobina (espiras) ligada a uma fonte.
    <S>
      <path d="M2 10h3" />
      <path d="M5 10c0-3 3-3 3 0s3 3 3 0 3-3 3 0" />
      <path d="M14 10h4" />
      <circle cx="10" cy="15.5" r="2" />
    </S>
  ),
  code: (
    <S>
      <path d="M7 6l-4 4 4 4M13 6l4 4-4 4M11 4l-2 12" />
    </S>
  ),
  region: (
    <S>
      <path d="M3 5l7-2 7 4-2 9-9 1z" fill="currentColor" fillOpacity="0.25" />
    </S>
  ),
  boundary: (
    <S>
      <path d="M3 17V3h14" strokeWidth="2.6" />
      <path d="M7 17h10V7" strokeDasharray="2 2" />
    </S>
  ),
  treePost: (
    <S>
      <path d="M3 17V3M3 17h14" />
      <path d="M5 14c3-1 4-8 7-8s3 5 5 5" />
    </S>
  ),
  offset: (
    <S>
      <rect x="6" y="6" width="8" height="8" rx="0.5" />
      <rect x="3" y="3" width="14" height="14" rx="1.5" strokeDasharray="2.5 2" />
    </S>
  ),
  mirror: (
    <S>
      <path d="M10 2v16" strokeDasharray="2 2" />
      <path d="M8 5L3 15h5z" />
      <path d="M12 5l5 10h-5z" opacity=".55" />
    </S>
  ),
  arrayLinear: (
    <S>
      <rect x="2.5" y="7" width="4" height="6" />
      <rect x="8" y="7" width="4" height="6" />
      <rect x="13.5" y="7" width="4" height="6" opacity=".55" />
    </S>
  ),
  arrayCircular: (
    <S>
      <circle cx="10" cy="10" r="6.5" strokeDasharray="1.5 2" />
      <circle cx="10" cy="3.5" r="1.8" fill="currentColor" />
      <circle cx="16.1" cy="12" r="1.8" fill="currentColor" opacity=".7" />
      <circle cx="3.9" cy="12" r="1.8" fill="currentColor" opacity=".45" />
    </S>
  ),
  newFile: (
    <S>
      <path d="M5 2.5h6.5L15.5 6.5V17.5H5z" />
      <path d="M11.5 2.5v4h4M10 9.5v5M7.5 12h5" />
    </S>
  ),
  openFile: (
    <S>
      <path d="M2.5 16.5V4.5h5l1.5 2h7.5v3" />
      <path d="M2.5 16.5l2.5-7h13l-2.5 7z" />
    </S>
  ),
  save: (
    <S>
      <path d="M3.5 3.5h10.5l2.5 2.5v10.5h-13z" />
      <path d="M6.5 3.5v4h6v-4M6 16.5v-5h8v5" />
    </S>
  ),
  saveAs: (
    <S>
      <path d="M3.5 3.5h8.5l2.5 2.5v3M3.5 3.5v13h6" />
      <path d="M6.5 3.5v4h5v-4" />
      <path d="M12 17.5l.6-2.4 4.4-4.4 1.8 1.8-4.4 4.4z" />
    </S>
  ),
  exportFile: (
    <S>
      <path d="M4 12v4.5h12V12" />
      <path d="M10 13V3M6.5 6.5L10 3l3.5 3.5" />
    </S>
  ),
  sun: (
    <S>
      <circle cx="10" cy="10" r="3.5" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" />
    </S>
  ),
  moon: (
    <S>
      <path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z" />
    </S>
  ),
  themeAuto: (
    <S>
      <circle cx="10" cy="10" r="6.5" />
      <path d="M10 3.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" />
    </S>
  ),
  popout: (
    <S>
      <path d="M11 3h6v6M17 3l-8 8" />
      <path d="M15 12v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" />
    </S>
  ),
  dock: (
    <S>
      <rect x="3" y="3" width="14" height="14" rx="1.5" />
      <path d="M3 12h14" />
      <path d="M10 5v5M7.5 7.5L10 10l2.5-2.5" />
    </S>
  ),
  book: (
    <S>
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H16v12H5.5A1.5 1.5 0 0 0 4 16.5z" />
      <path d="M4 16.5A1.5 1.5 0 0 0 5.5 18H16v-3" />
      <path d="M7.5 6.5h5M7.5 9h4" />
    </S>
  ),
  copy: (
    <S>
      <rect x="6.5" y="6.5" width="10" height="10" rx="1.5" />
      <path d="M4 13.5V4.5A1 1 0 0 1 5 3.5h8.5" />
    </S>
  ),
  circle: (
    <S>
      <circle cx="10" cy="10" r="6.5" />
      {dot(10, 10)}
    </S>
  ),
  arc3: (
    <S>
      <path d="M3.5 14A7 7 0 0 1 16.5 14" />
      {dot(3.5, 14)}
      {dot(10, 7)}
      {dot(16.5, 14)}
    </S>
  ),
  arcc: (
    <S>
      <path d="M16.5 12A6.5 6.5 0 0 0 10 5.5" />
      <path d="M10 12h6.5M10 12V5.5" strokeDasharray="1.5 2" />
      {dot(10, 12)}
    </S>
  ),
  point: <S>{dot(10, 10)}<circle cx="10" cy="10" r="3.5" /></S>,
  dimension: (
    <S>
      <path d="M3 6v8M17 6v8M3 10h14" />
      <path d="M5.5 8L3 10l2.5 2M14.5 8L17 10l-2.5 2" />
    </S>
  ),
  coincident: (
    <S>
      <circle cx="10" cy="10" r="3" fill="currentColor" />
      <path d="M3 10h3.5M13.5 10H17" />
    </S>
  ),
  horizontal: (
    <S>
      <path d="M3 10h14" />
      <text x="10" y="7" fontSize="6" textAnchor="middle" fill="currentColor" stroke="none">H</text>
    </S>
  ),
  vertical: (
    <S>
      <path d="M10 3v14" />
      <text x="14.5" y="12" fontSize="6" textAnchor="middle" fill="currentColor" stroke="none">V</text>
    </S>
  ),
  parallel: (
    <S>
      <path d="M5 16L11 4M9 16l6-12" />
    </S>
  ),
  perpendicular: (
    <S>
      <path d="M4 16h12M10 16V4" />
    </S>
  ),
  tangent: (
    <S>
      <circle cx="10" cy="11" r="4.5" />
      <path d="M3 6.5h14" />
    </S>
  ),
  equal: (
    <S>
      <path d="M4 8h12M4 12h12" />
    </S>
  ),
  midpoint: (
    <S>
      <path d="M3 14L17 6" />
      <circle cx="10" cy="10" r="2" fill="currentColor" />
    </S>
  ),
  symmetric: (
    <S>
      <path d="M10 3v14" strokeDasharray="2 2" />
      {dot(5, 10)}
      {dot(15, 10)}
    </S>
  ),
  concentric: (
    <S>
      <circle cx="10" cy="10" r="6.5" />
      <circle cx="10" cy="10" r="3" />
    </S>
  ),
  fix: (
    <S>
      <rect x="6" y="9" width="8" height="7" rx="1" />
      <path d="M7.5 9V6.5a2.5 2.5 0 0 1 5 0V9" />
    </S>
  ),
  construction: (
    <S>
      <path d="M3 17L17 3" strokeDasharray="3 2.5" />
    </S>
  ),
  trash: (
    <S>
      <path d="M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11" />
    </S>
  ),
  undo: (
    <S>
      <path d="M7 5L3 9l4 4" />
      <path d="M3 9h9a4.5 4.5 0 0 1 0 9H9" />
    </S>
  ),
  redo: (
    <S>
      <path d="M13 5l4 4-4 4" />
      <path d="M17 9H8a4.5 4.5 0 0 0 0 9h3" />
    </S>
  ),
  fit: (
    <S>
      <path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" />
    </S>
  ),
};
