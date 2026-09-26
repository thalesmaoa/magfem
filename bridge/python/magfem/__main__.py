"""python -m magfem [--port 8765] [--key CHAVE]: sobe a ponte local e mostra a chave de pareamento."""

import argparse

import json

from .bridge import DEFAULT_PORT, VERSION, Bridge


def main() -> None:
    ap = argparse.ArgumentParser(prog="magfem", description="Ponte local entre scripts e o MagFEM no navegador.")
    ap.add_argument("--port", type=int, default=DEFAULT_PORT)
    ap.add_argument("--key", default=None, help="chave fixa (padrão: gerada a cada execução)")
    a = ap.parse_args()
    key_holder: list[str] = []

    def log(event: str) -> None:
        if event == "connected":
            k = key_holder[0]
            print("\n● Página do MagFEM conectada. A ponte fica rodando aqui; mande comandos de outro terminal:", flush=True)
            print(f'    python -c "import magfem; mf = magfem.connect(key=\'{k}\'); print(mf.run(\'g.circle((0, 0), r=5)\'))"')
            print("  (ou rode um script seu com magfem.connect(key=...); exemplos em bridge/python/examples)", flush=True)
        elif event == "disconnected":
            print("○ Página desconectada (esperando reconectar).", flush=True)
        elif event.startswith("run:"):
            r = json.loads(event[4:])
            first = r["code"].strip().splitlines()[0] if r["code"].strip() else ""
            more = " …" if len(r["code"].strip().splitlines()) > 1 else ""
            print(f"  {'✓' if r['ok'] else '✗'} {first[:80]}{more}" + ("" if r["ok"] else f"  → {r['error']}"), flush=True)

    b = Bridge(port=a.port, key=a.key, log=log)
    key_holder.append(b.key)
    print(f"MagFEM bridge {VERSION} em http://127.0.0.1:{a.port}")
    print(f"  No app: clique em 'Script local', porta {a.port}, chave: {b.key}")
    print(f"  Scripts: POST /run {{\"code\": \"...\"}} com o cabeçalho X-MagFEM-Key: {b.key}")
    print("  Ctrl+C encerra. Esperando a página conectar…", flush=True)
    try:
        b.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
