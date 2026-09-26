// Ponte com scripts locais (pacote Python `magfem`): a página conecta por WebSocket em
// ws://127.0.0.1:<porta>/ws, apresenta a chave de pareamento e executa os comandos recebidos no console.
import { useSyncExternalStore } from 'react';
import { CommandConsole, completions } from '../cad/console';
import type { SketchEditor } from '../cad/editor';
import { editorConsoleHost } from '../ui/consoleHost';

export interface BridgeState {
  status: 'off' | 'connecting' | 'on' | 'error';
  port: number;
  message?: string;
  /** Comandos recebidos nesta conexão. */
  count: number;
}

let state: BridgeState = { status: 'off', port: loadPort(), count: 0 };
const listeners = new Set<() => void>();
let socket: WebSocket | null = null;

function set(patch: Partial<BridgeState>) {
  state = { ...state, ...patch };
  listeners.forEach((f) => f());
}

function loadPort(): number {
  try {
    return Number(localStorage.getItem('magfem-bridge-port')) || 8765;
  } catch {
    return 8765;
  }
}

/** Última chave usada (com `python -m magfem --key ...` fixa, não precisa colar de novo). */
export function loadKey(): string {
  try {
    return localStorage.getItem('magfem-bridge-key') ?? '';
  } catch {
    return '';
  }
}

export function useBridge(): BridgeState {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => state,
  );
}

export function disconnectBridge() {
  socket?.close();
  socket = null;
  set({ status: 'off', message: undefined });
}

export function connectBridge(ed: SketchEditor, port: number, key: string) {
  disconnectBridge();
  try {
    localStorage.setItem('magfem-bridge-port', String(port));
    localStorage.setItem('magfem-bridge-key', key);
  } catch {
    // ignora
  }
  set({ status: 'connecting', port, count: 0, message: undefined });
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  socket = ws;
  // Um console por conexão: variáveis do script (a = g.point(...)) valem entre comandos.
  const cmd = new CommandConsole(editorConsoleHost(ed));
  let queue = Promise.resolve();
  ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', key: key.trim(), app: 'magfem' }));
  ws.onerror = () => set({ status: 'error', message: `sem ponte em 127.0.0.1:${port}` });
  ws.onclose = () => {
    if (socket === ws) socket = null;
    if (state.status !== 'error') set({ status: 'off' });
  };
  ws.onmessage = (ev) => {
    let msg: { type?: string; id?: number; code?: string; text?: string; error?: string };
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    if (msg.type === 'welcome') set({ status: 'on' });
    else if (msg.type === 'error') set({ status: 'error', message: msg.error });
    else if (msg.type === 'complete' && typeof msg.text === 'string') {
      // Tab no console do terminal: as mesmas sugestões do console da web (com as variáveis desta conexão).
      const r = completions(ed.sketch, cmd.env, msg.text);
      ws.send(JSON.stringify({ type: 'result', id: msg.id, ok: true, start: r.start, items: r.items.map(({ insert, label, detail }) => ({ insert, label, detail })) }));
    } else if (msg.type === 'run' && typeof msg.code === 'string') {
      const { id, code } = msg;
      // Em fila: um comando termina (inclusive a solução) antes do próximo começar.
      queue = queue.then(async () => {
        const reply = await runScript(ed, cmd, code);
        set({ count: state.count + 1 });
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'result', id, ...reply }));
      });
    }
  };
}

/** Executa as linhas em ordem; espera malha/solução iniciadas por uma linha antes da próxima. */
export async function runScript(ed: SketchEditor, cmd: CommandConsole, code: string): Promise<{ ok: boolean; value?: unknown; out?: string[]; error?: string; line?: string }> {
  const out: string[] = [];
  let value: unknown = null;
  for (const raw of code.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    cmd.pending = null;
    const r = cmd.run(line);
    if (!r.ok) return { ok: false, error: r.out ?? 'erro', line, out };
    if (r.out !== null) out.push(r.out);
    value = r.value ?? null;
    const pr = cmd.pending as Promise<unknown> | null;
    if (pr) {
      const res = await pr;
      cmd.pending = null;
      if (res === false || res === null) {
        // Solução ou malha falharam: a mensagem fica nos erros do editor.
        const msg = [...ed.solveErrors.values(), ...ed.meshErrors.values()].pop() ?? 'falhou';
        return { ok: false, error: msg, line, out };
      }
    }
  }
  return { ok: true, value, out };
}
