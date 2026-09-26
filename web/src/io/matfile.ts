// Arquivo .mat (MATLAB nível 5, sem compressão) com vetores coluna de double: abre com scipy.io.loadmat (Python),
// MAT.jl (Julia) e load (MATLAB/Octave).

/** Nome de variável válido no MATLAB (letra inicial, letras/dígitos/_, até 63 caracteres). */
export function matName(s: string): string {
  let n = s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_]/g, '_');
  if (!/^[A-Za-z]/.test(n)) n = `v_${n}`;
  return n.slice(0, 63);
}

const pad8 = (n: number) => (8 - (n % 8)) % 8;

/** Monta o .mat com as variáveis dadas (cada uma vira um vetor coluna N×1). Nomes repetidos ganham sufixo. */
export function matFile(vars: { name: string; data: ArrayLike<number> }[]): Uint8Array<ArrayBuffer> {
  const used = new Set<string>();
  const items = vars.map((v) => {
    let n = matName(v.name);
    for (let k = 2; used.has(n); k++) n = `${matName(v.name).slice(0, 60)}_${k}`;
    used.add(n);
    return { name: n, data: v.data };
  });
  const elemSize = (it: (typeof items)[number]) => {
    const nameLen = it.name.length;
    // Flags (16) + dimensões (16) + nome (8 + dados alinhados) + parte real (8 + 8·N).
    return 16 + 16 + 8 + nameLen + pad8(nameLen) + 8 + 8 * it.data.length;
  };
  const total = 128 + items.reduce((s, it) => s + 8 + elemSize(it), 0);
  const buf = new ArrayBuffer(total);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  // Cabeçalho: 116 bytes de texto, 8 de subsistema, versão 0x0100 e o indicador de ordem de bytes "IM" (little-endian).
  const text = `MATLAB 5.0 MAT-file, Platform: MagFEM, Created on: ${new Date().toUTCString()}`.padEnd(116, ' ').slice(0, 116);
  for (let i = 0; i < 116; i++) u8[i] = text.charCodeAt(i) & 0x7f;
  dv.setUint16(124, 0x0100, true);
  u8[126] = 'I'.charCodeAt(0);
  u8[127] = 'M'.charCodeAt(0);
  let o = 128;
  const tag = (type: number, bytes: number) => {
    dv.setUint32(o, type, true);
    dv.setUint32(o + 4, bytes, true);
    o += 8;
  };
  for (const it of items) {
    tag(14, elemSize(it)); // miMATRIX
    tag(6, 8); // flags: miUINT32
    dv.setUint32(o, 6, true); // mxDOUBLE_CLASS
    dv.setUint32(o + 4, 0, true);
    o += 8;
    tag(5, 8); // dimensões: miINT32
    dv.setInt32(o, it.data.length, true);
    dv.setInt32(o + 4, 1, true);
    o += 8;
    tag(1, it.name.length); // nome: miINT8
    for (let i = 0; i < it.name.length; i++) u8[o + i] = it.name.charCodeAt(i);
    o += it.name.length + pad8(it.name.length);
    tag(9, 8 * it.data.length); // parte real: miDOUBLE
    for (let i = 0; i < it.data.length; i++) dv.setFloat64(o + 8 * i, it.data[i], true);
    o += 8 * it.data.length;
  }
  return u8;
}
