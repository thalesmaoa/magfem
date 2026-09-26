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

    prompting = threading.Event()  # o console está esperando uma linha (há um prompt na tela)

    def say(text: str, redraw: bool = True) -> None:
        # Mensagem assíncrona: não bagunça a linha do prompt (e o redesenha só se ele estiver na tela).
        on = interactive and prompting.is_set()
        sys.stdout.write(("\r\033[K" if on else "") + text + "\n" + (PROMPT if on and redraw else ""))
        sys.stdout.flush()

    def log(event: str) -> None:
        if event == "connected":
            # Mensagem antes de liberar o console: o prompt vem depois dela, sem duplicar.
            say(
                "● Página do MagFEM conectada." + (" Digite comandos do console (help() lista; Ctrl+D sai)." if interactive else "")
                + f"\n  Scripts em outro terminal: mf = magfem.connect(key=\"{key[0]}\")"
            )
            connected.set()
        elif event == "disconnected":
            connected.clear()
            say("○ Página desconectada (esperando reconectar; o console volta quando ela conectar).", redraw=False)
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
        _console(b, connected, prompting)
    except KeyboardInterrupt:
        print()
    finally:
        b.stop()


def _console(b: Bridge, connected: threading.Event, prompting: threading.Event) -> None:
    """Console como o da web: cada linha vai para a página; mostra a saída, o valor e os erros.

    O prompt só aparece com a página conectada; se ela cair, a próxima linha espera a reconexão.
    """
    try:
        import readline  # histórico com ↑, edição de linha e Tab (quando existe)
    except ImportError:
        readline = None
    if readline is not None:
        _setup_completion(readline, b)
    while True:
        while not connected.wait(0.5):  # timeout curto: Ctrl+C continua funcionando
            pass
        prompting.set()
        try:
            line = input(PROMPT)
        except EOFError:
            print()
            return
        finally:
            prompting.clear()
        if not line.strip():
            continue
        if line.strip() in ("exit", "quit", "exit()", "quit()"):
            return
        if not connected.is_set():
            print("  (a página desconectou; a linha não foi enviada. Esperando reconectar…)")
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


def _setup_completion(readline, b: Bridge) -> None:
    """Tab completa como o console da web: a página devolve as sugestões (comandos, ids, variáveis)."""
    matches: list[str] = []
    labels: dict[str, str] = {}

    def complete(_text: str, state: int) -> str | None:
        if state == 0:
            matches.clear()
            labels.clear()
            line = readline.get_line_buffer()[: readline.get_endidx()]
            try:
                r = b.complete(line)
            except Exception:
                r = {}
            start = r.get("start", len(line))
            for it in r.get("items") or []:
                full = line[:start] + it["insert"]
                matches.append(full)
                labels[full] = it["label"] + (f"  ({it['detail']})" if it.get("detail") else "")
        return matches[state] if state < len(matches) else None

    def show(_sub: str, found: list[str], _longest: int) -> None:
        # Lista pelos nomes (não pela linha inteira) e redesenha o prompt com o que já foi digitado.
        print()
        for f in found[:40]:
            print(f"  {labels.get(f, f)}")
        if len(found) > 40:
            print(f"  … (+{len(found) - 40})")
        print(PROMPT + readline.get_line_buffer(), end="", flush=True)

    readline.set_completer_delims("")  # o texto a completar é a linha toda até o cursor
    readline.set_completer(complete)
    readline.set_completion_display_matches_hook(show)
    # libedit (macOS) usa outra sintaxe para ligar o Tab.
    readline.parse_and_bind("bind ^I rl_complete" if "libedit" in (readline.__doc__ or "") else "tab: complete")


if __name__ == "__main__":
    main()
