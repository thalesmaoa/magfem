"""python -m magfem [--port 8765] [--key CHAVE]: sobe a ponte local e abre um console ligado à página do MagFEM.

As linhas digitadas vão para o console do app (as mesmas do console da web); os scripts, em outro terminal,
usam magfem.connect(key=...) e seus comandos aparecem aqui também.
"""

import argparse
import json
import sys
import threading

from .bridge import DEFAULT_PORT, VERSION, Bridge, BridgeError

PROMPT = "magfem> "


def main() -> None:
    ap = argparse.ArgumentParser(prog="magfem", description="Ponte local entre scripts e o MagFEM no navegador.")
    ap.add_argument("--port", type=int, default=DEFAULT_PORT)
    ap.add_argument("--key", default=None, help="chave fixa (padrão: gerada a cada execução)")
    ap.add_argument("--no-console", action="store_true", help="só a ponte, sem o console interativo")
    a = ap.parse_args()
    interactive = sys.stdin.isatty() and not a.no_console
    connected = threading.Event()
    key: list[str] = []

    def say(text: str) -> None:
        # Mensagem assíncrona: não bagunça a linha do prompt.
        sys.stdout.write(("\r\033[K" if interactive else "") + text + "\n" + (PROMPT if interactive else ""))
        sys.stdout.flush()

    def log(event: str) -> None:
        if event == "connected":
            connected.set()
            say("● Página do MagFEM conectada." + (" Digite comandos do console (help() lista; Ctrl+D sai)." if interactive else ""))
            say(f"  Scripts em outro terminal: mf = magfem.connect(key=\"{key[0]}\")")
        elif event == "disconnected":
            connected.clear()
            say("○ Página desconectada (esperando reconectar).")
        elif event.startswith("run:"):
            r = json.loads(event[4:])
            lines = r["code"].strip().splitlines() or [""]
            more = " …" if len(lines) > 1 else ""
            say(f"  [script] {'✓' if r['ok'] else '✗'} {lines[0][:80]}{more}" + ("" if r["ok"] else f"  → {r['error']}"))

    b = Bridge(port=a.port, key=a.key, log=log)
    key.append(b.key)
    try:
        b.start()
    except BridgeError as e:
        sys.exit(f"magfem: {e} (já há uma ponte nessa porta? use --port)")
    print(f"MagFEM bridge {VERSION} em http://127.0.0.1:{a.port}")
    print(f"  No app: clique em 'Script local', porta {a.port}, chave: {b.key}")
    if not a.key:
        print("  (chave nova a cada execução; para usar sempre a mesma: python -m magfem --key sua-chave)")
    print(f"  Scripts: POST /run {{\"code\": \"...\"}} com o cabeçalho X-MagFEM-Key: {b.key}")
    print("  Esperando a página conectar… (Ctrl+C encerra)", flush=True)
    try:
        if not interactive:
            threading.Event().wait()
        _console(b, connected)
    except KeyboardInterrupt:
        print()
    finally:
        b.stop()


def _console(b: Bridge, connected: threading.Event) -> None:
    """Console como o da web: cada linha vai para a página; mostra a saída, o valor e os erros."""
    try:
        import readline  # noqa: F401  (histórico com ↑ e edição de linha, quando existe)
    except ImportError:
        pass
    while True:
        try:
            line = input(PROMPT)
        except EOFError:
            print()
            return
        if not line.strip():
            continue
        if line.strip() in ("exit", "quit", "exit()", "quit()"):
            return
        if not connected.is_set():
            print("  (nenhuma página conectada: no app, clique em 'Script local' e cole a porta e a chave)")
            continue
        try:
            r = b.run(line)
        except Exception as e:  # tempo esgotado, ponte caiu…
            print(f"  ✗ {e}")
            continue
        for out in r.get("out") or []:
            print(f"  {out}")
        if not r.get("ok"):
            print(f"  ✗ {r.get('error')}")
        elif r.get("value") is not None and not r.get("out"):
            print(f"  {json.dumps(r['value'], ensure_ascii=False)}")


if __name__ == "__main__":
    main()
