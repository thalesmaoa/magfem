"""python -m magfem [--port 8765] [--key CHAVE]: sobe a ponte local e mostra a chave de pareamento."""

import argparse

from .bridge import DEFAULT_PORT, VERSION, Bridge


def main() -> None:
    ap = argparse.ArgumentParser(prog="magfem", description="Ponte local entre scripts e o MagFEM no navegador.")
    ap.add_argument("--port", type=int, default=DEFAULT_PORT)
    ap.add_argument("--key", default=None, help="chave fixa (padrão: gerada a cada execução)")
    a = ap.parse_args()
    b = Bridge(port=a.port, key=a.key)
    print(f"MagFEM bridge {VERSION} em http://127.0.0.1:{a.port}")
    print(f"  No app: clique em 'Script local', porta {a.port}, chave: {b.key}")
    print(f"  Scripts: POST /run {{\"code\": \"...\"}} com o cabeçalho X-MagFEM-Key: {b.key}")
    print("  Ctrl+C encerra.", flush=True)
    try:
        b.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
