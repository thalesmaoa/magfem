"""Sessão de teste para clientes de outras linguagens: ponte + "navegador" falso.

    python tests/fake_session.py 8798 chave
O navegador falso responde cada comando com o código em maiúsculas; r.series(...) devolve [[0, 1], [2, 3]].
"""

import sys
import threading
import time

sys.path.insert(0, __file__.rsplit("/tests/", 1)[0])
from magfem import Bridge  # noqa: E402
from test_bridge import FakeBrowser  # noqa: E402


class SeriesBrowser(FakeBrowser):
    def serve(self) -> None:
        while True:
            try:
                m = self.recv()
            except (ConnectionError, OSError):
                return
            if m is None:
                return
            if m.get("type") == "run":
                code = m["code"]
                if code.startswith("r.series"):
                    val = [[0, 1], [2, 3]]
                elif code.startswith("r.result"):
                    val = -9.97
                elif "falha" in code:
                    self.send({"type": "result", "id": m["id"], "ok": False, "error": "comando inválido", "line": code})
                    continue
                else:
                    val = code.upper()
                self.send({"type": "result", "id": m["id"], "ok": True, "value": val, "out": []})


if __name__ == "__main__":
    port, key = int(sys.argv[1]), sys.argv[2]
    b = Bridge(port=port, key=key).start()
    br = SeriesBrowser(port, key)
    br.recv()  # welcome
    threading.Thread(target=br.serve, daemon=True).start()
    print("pronto", flush=True)
    time.sleep(float(sys.argv[3]) if len(sys.argv) > 3 else 600)
