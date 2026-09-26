"""Cliente Python do MagFEM: controla o modelo aberto no navegador pela ponte local.

    import magfem
    mf = magfem.connect()                 # sobe a ponte (se preciso), mostra a chave e espera a página
    mf.set_var("g", "0.5 mm")
    mf.solve()
    print(mf.result("Fx_s"))              # número de uma variável de resultado
    print(mf.results())                   # {nome: (valor, unidade)}
    t, i = mf.series("I_bob")             # transitório: curva no tempo

Qualquer linha do console do MagFEM vale em mf.run(...) (a mesma API do histórico e do "exportar código").
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from typing import Any

from .bridge import DEFAULT_PORT, Bridge, BridgeError


def _q(v: Any) -> str:
    """Literal do console: textos entre aspas (escapadas), números como estão, None/True/False."""
    if v is None:
        return "None"
    if isinstance(v, bool):
        return "True" if v else "False"
    if isinstance(v, (int, float)):
        return repr(v)
    return json.dumps(str(v), ensure_ascii=False)


class MagFEM:
    def __init__(self, port: int = DEFAULT_PORT, key: str | None = None, start: bool = True):
        self.port = port
        self.base = f"http://127.0.0.1:{port}"
        self.bridge: Bridge | None = None
        if start and not self._server_up():
            self.bridge = Bridge(port=port, key=key).start()
            key = self.bridge.key
        if not key:
            raise BridgeError(f"já existe uma ponte em {self.base}: passe a chave dela (key=...)")
        self.key = key

    # ---------- ponte ----------
    def _server_up(self) -> bool:
        try:
            with urllib.request.urlopen(self.base + "/status", timeout=1) as r:
                return r.status == 200
        except (urllib.error.URLError, OSError):
            return False

    def status(self) -> dict[str, Any]:
        with urllib.request.urlopen(self.base + "/status", timeout=5) as r:
            return json.loads(r.read())

    def wait_browser(self, timeout: float | None = None, quiet: bool = False) -> "MagFEM":
        """Espera a página do MagFEM conectar (botão 'Script local' no app, com a porta e a chave)."""
        if not quiet and not self.status().get("browser"):
            print(f"MagFEM: no app, clique em 'Script local' e use porta {self.port} e chave {self.key}", flush=True)
        t0 = time.time()
        while not self.status().get("browser"):
            if timeout is not None and time.time() - t0 > timeout:
                raise BridgeError("a página do MagFEM não conectou a tempo")
            time.sleep(0.3)
        return self

    def run(self, code: str) -> Any:
        """Executa uma ou mais linhas do console; devolve o valor da última. Erro → BridgeError."""
        req = urllib.request.Request(
            self.base + "/run",
            data=json.dumps({"code": code}).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-MagFEM-Key": self.key},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=3600) as r:
                res = json.loads(r.read())
        except urllib.error.HTTPError as e:
            res = json.loads(e.read() or b"{}")
        if not res.get("ok"):
            line = f" (linha: {res['line']})" if res.get("line") else ""
            raise BridgeError(f"{res.get('error', 'erro desconhecido')}{line}")
        return res.get("value")

    # ---------- atalhos ----------
    def set_var(self, name: str, expr: str | float) -> None:
        """Muda uma variável do projeto (cria se não existir), ex.: set_var("g", "0.5 mm")."""
        self.run(f"g.var({_q(name)}, {_q(str(expr))})")

    def solve(self, physics: str | None = None) -> None:
        """Resolve (gera a malha se preciso) e espera terminar."""
        self.run(f"s.solve({_q(physics)})" if physics else "s.solve()")

    def result(self, name: str, physics: str | None = None) -> float:
        return float(self.run(f"r.result({_q(name)}{', physics=' + _q(physics) if physics else ''})"))

    def results(self, physics: str | None = None) -> dict[str, tuple[float, str]]:
        rows = self.run(f"r.results({_q(physics)})" if physics else "r.results()")
        return {name: (value, unit) for name, value, unit in rows}

    def series(self, name: str, physics: str | None = None) -> tuple[list[float], list[float]]:
        t, y = self.run(f"r.series({_q(name)}{', physics=' + _q(physics) if physics else ''})")
        return list(t), list(y)

    def close(self) -> None:
        if self.bridge:
            self.bridge.stop()
            self.bridge = None


def connect(port: int = DEFAULT_PORT, key: str | None = None, wait: bool = True, timeout: float | None = None) -> MagFEM:
    """Sobe a ponte (se não houver uma na porta), mostra a chave e espera a página do MagFEM conectar."""
    mf = MagFEM(port=port, key=key)
    if wait:
        mf.wait_browser(timeout=timeout)
    return mf
