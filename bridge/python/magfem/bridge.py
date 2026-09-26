"""Ponte local entre scripts e o MagFEM no navegador (só a biblioteca padrão do Python).

O navegador (a página do MagFEM) conecta por WebSocket em ws://127.0.0.1:<porta>/ws e se apresenta
com a chave de pareamento. Scripts (Python, Matlab, Julia, curl...) mandam comandos por HTTP:

    POST /run      {"code": "g.var(\"g\", \"0.5 mm\")\\ns.solve()"}   cabeçalho X-MagFEM-Key: <chave>
    GET  /status   {"browser": true|false, "version": "..."}

Cada comando é uma linha do console do MagFEM (a mesma API do histórico e do "exportar código");
a resposta traz o valor da última linha, as saídas e, em caso de erro, a mensagem e a linha.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import itertools
import json
import re
import secrets
import struct
import threading
import urllib.parse
from typing import Any, Callable

VERSION = "1.0.0"
DEFAULT_PORT = 8765
_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
# Páginas que podem conectar: o site publicado e o servidor de desenvolvimento local.
_ALLOWED_ORIGIN = re.compile(r"^(https://(www\.)?thalesmaia\.com|http://(localhost|127\.0\.0\.1)(:\d+)?)$")


class BridgeError(RuntimeError):
    """Erro vindo do MagFEM (comando inválido, falha na solução...) ou da ponte."""


class Bridge:
    """Servidor da ponte. Use start() para rodar numa thread, ou serve_forever() em primeiro plano."""

    def __init__(self, port: int = DEFAULT_PORT, key: str | None = None, host: str = "127.0.0.1", log: Callable[[str], None] | None = None):
        self.host = host
        self._log = log or (lambda _msg: None)
        self.port = port
        self.key = key or secrets.token_urlsafe(9)
        self._loop: asyncio.AbstractEventLoop | None = None
        self._server: asyncio.base_events.Server | None = None
        self._browser: _WebSocket | None = None
        self._pending: dict[int, asyncio.Future] = {}
        self._ids = itertools.count(1)
        self._ready = threading.Event()
        self._thread: threading.Thread | None = None

    # ---------- ciclo de vida ----------
    async def _start(self) -> None:
        self._loop = asyncio.get_running_loop()
        self._server = await asyncio.start_server(self._handle, self.host, self.port)
        self._ready.set()

    def start(self) -> "Bridge":
        """Roda o servidor numa thread em segundo plano (volta assim que estiver escutando)."""

        def run() -> None:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(self._start())
            try:
                loop.run_forever()
            finally:
                loop.close()

        self._thread = threading.Thread(target=run, name="magfem-bridge", daemon=True)
        self._thread.start()
        if not self._ready.wait(5):
            raise BridgeError(f"não foi possível escutar em {self.host}:{self.port}")
        return self

    def serve_forever(self) -> None:
        async def main() -> None:
            await self._start()
            await asyncio.Event().wait()

        asyncio.run(main())

    def stop(self) -> None:
        """Fecha a página conectada e o servidor, cancela o que está pendente e para a thread."""
        loop = self._loop
        if not loop or not loop.is_running():
            return

        async def shutdown() -> None:
            if self._server:
                self._server.close()
            if self._browser:
                await self._browser.close()
            tasks = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
            for t in tasks:
                t.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

        try:
            asyncio.run_coroutine_threadsafe(shutdown(), loop).result(5)
        except Exception:
            pass
        loop.call_soon_threadsafe(loop.stop)
        if self._thread:
            self._thread.join(5)
        self._loop = None

    @property
    def browser_connected(self) -> bool:
        return self._browser is not None and not self._browser.closed

    # ---------- execução de comandos (chamável de qualquer thread) ----------
    def run(self, code: str, timeout: float | None = 600) -> dict[str, Any]:
        """Manda código ao navegador e espera a resposta (dict com ok, value, out, error)."""
        if not self._loop:
            raise BridgeError("a ponte não está rodando")
        fut = asyncio.run_coroutine_threadsafe(self._run(code, log=False), self._loop)
        return fut.result(timeout)

    async def _run(self, code: str, log: bool = True) -> dict[str, Any]:
        if not self.browser_connected:
            return {"ok": False, "error": "nenhuma página do MagFEM conectada (clique em 'Script local' no app e cole a chave)"}
        rid = next(self._ids)
        fut = asyncio.get_running_loop().create_future()
        self._pending[rid] = fut
        try:
            await self._browser.send(json.dumps({"type": "run", "id": rid, "code": code}))
            res = await fut
            if log:  # comandos vindos de scripts (HTTP); os do próprio console do terminal não se repetem
                self._log("run:" + json.dumps({"code": code, "ok": res.get("ok"), "error": res.get("error")}))
            return res
        finally:
            self._pending.pop(rid, None)

    # ---------- HTTP / WebSocket ----------
    async def _handle(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            head = await reader.readuntil(b"\r\n\r\n")
        except (asyncio.IncompleteReadError, asyncio.LimitOverrunError, ConnectionError):
            writer.close()
            return
        lines = head.decode("latin-1").split("\r\n")
        try:
            method, path, _ = lines[0].split(" ", 2)
        except ValueError:
            writer.close()
            return
        headers = {k.strip().lower(): v.strip() for k, v in (ln.split(":", 1) for ln in lines[1:] if ":" in ln)}
        path = path.split("?", 1)[0]
        try:
            if path == "/ws" and headers.get("upgrade", "").lower() == "websocket":
                await self._websocket(reader, writer, headers)
            elif path == "/status" and method == "GET":
                await _reply(writer, 200, {"browser": self.browser_connected, "version": VERSION})
            elif path == "/run" and method == "POST":
                n = int(headers.get("content-length", "0") or 0)
                body = await reader.readexactly(n) if n else b""
                # JSON {"code": ...} com o cabeçalho X-MagFEM-Key, ou formulário key=...&code=... (Octave/Matlab).
                key = headers.get("x-magfem-key", "")
                is_form = "application/x-www-form-urlencoded" in headers.get("content-type", "")
                if is_form:
                    form = urllib.parse.parse_qs(body.decode("utf-8"), keep_blank_values=True)
                    code = form.get("code", [""])[0]
                    key = key or form.get("key", [""])[0]
                else:
                    try:
                        code = json.loads(body.decode("utf-8") or "{}").get("code", "")
                    except (ValueError, AttributeError):
                        await _reply(writer, 400, {"ok": False, "error": "corpo JSON inválido: {\"code\": \"...\"}"})
                        return
                if not secrets.compare_digest(key, self.key):
                    # Formulário (Octave): 200 com ok = false, senão o cliente só vê um erro HTTP genérico.
                    await _reply(writer, 200 if is_form else 401, {"ok": False, "error": "chave inválida (cabeçalho X-MagFEM-Key)"})
                    return
                await _reply(writer, 200, await self._run(str(code)))
            else:
                await _reply(writer, 404, {"ok": False, "error": "use POST /run, GET /status ou o WebSocket /ws"})
        except (ConnectionError, asyncio.IncompleteReadError):
            pass
        finally:
            if not writer.is_closing():
                writer.close()

    async def _websocket(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter, headers: dict[str, str]) -> None:
        origin = headers.get("origin", "")
        if origin and not _ALLOWED_ORIGIN.match(origin):
            await _reply(writer, 403, {"ok": False, "error": f"origem não permitida: {origin}"})
            return
        accept = base64.b64encode(hashlib.sha1((headers.get("sec-websocket-key", "") + _GUID).encode()).digest()).decode()
        writer.write(
            (
                "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                f"Sec-WebSocket-Accept: {accept}\r\n\r\n"
            ).encode()
        )
        await writer.drain()
        ws = _WebSocket(reader, writer)
        # Primeira mensagem: {"type": "hello", "key": "..."}; sem a chave certa, fecha.
        try:
            hello = json.loads(await asyncio.wait_for(ws.recv(), 30))
        except (asyncio.TimeoutError, ValueError, ConnectionError, TypeError):
            await ws.close()
            return
        if not isinstance(hello, dict) or not secrets.compare_digest(str(hello.get("key", "")), self.key):
            await ws.send(json.dumps({"type": "error", "error": "chave de pareamento inválida"}))
            await ws.close()
            return
        if self.browser_connected:
            await self._browser.close()
        self._browser = ws
        await ws.send(json.dumps({"type": "welcome", "version": VERSION}))
        self._log("connected")
        try:
            while True:
                msg = await ws.recv()
                if msg is None:
                    break
                try:
                    data = json.loads(msg)
                except ValueError:
                    continue
                if data.get("type") == "result":
                    fut = self._pending.get(data.get("id"))
                    if fut and not fut.done():
                        fut.set_result({k: v for k, v in data.items() if k not in ("type", "id")})
        finally:
            if self._browser is ws:
                self._browser = None
                self._log("disconnected")
            for fut in self._pending.values():
                if not fut.done():
                    fut.set_result({"ok": False, "error": "a página do MagFEM desconectou"})


async def _reply(writer: asyncio.StreamWriter, status: int, obj: Any) -> None:
    body = json.dumps(obj).encode("utf-8")
    reason = {200: "OK", 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found"}.get(status, "OK")
    writer.write(
        f"HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {len(body)}\r\nConnection: close\r\n\r\n".encode()
        + body
    )
    await writer.drain()


class _WebSocket:
    """WebSocket mínimo (RFC 6455) do lado do servidor: mensagens de texto, ping/pong, fechamento."""

    def __init__(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        self.reader, self.writer = reader, writer
        self.closed = False
        self._lock = asyncio.Lock()

    async def recv(self) -> str | None:
        parts: list[bytes] = []
        while True:
            try:
                b0, b1 = await self.reader.readexactly(2)
            except (asyncio.IncompleteReadError, ConnectionError):
                self.closed = True
                return None
            fin, op, masked, n = b0 & 0x80, b0 & 0x0F, b1 & 0x80, b1 & 0x7F
            if n == 126:
                (n,) = struct.unpack(">H", await self.reader.readexactly(2))
            elif n == 127:
                (n,) = struct.unpack(">Q", await self.reader.readexactly(8))
            mask = await self.reader.readexactly(4) if masked else b""
            data = await self.reader.readexactly(n)
            if masked:
                data = bytes(c ^ mask[i % 4] for i, c in enumerate(data))
            if op == 0x8:  # fechamento
                await self.close()
                return None
            if op == 0x9:  # ping → pong
                await self._frame(0xA, data)
                continue
            if op == 0xA:
                continue
            parts.append(data)
            if fin:
                return b"".join(parts).decode("utf-8")

    async def send(self, text: str) -> None:
        await self._frame(0x1, text.encode("utf-8"))

    async def _frame(self, op: int, data: bytes) -> None:
        n = len(data)
        head = bytes([0x80 | op]) + (bytes([n]) if n < 126 else struct.pack(">BH", 126, n) if n < 65536 else struct.pack(">BQ", 127, n))
        async with self._lock:
            self.writer.write(head + data)
            await self.writer.drain()

    async def close(self) -> None:
        if self.closed:
            return
        self.closed = True
        try:
            await self._frame(0x8, b"")
        except ConnectionError:
            pass
        self.writer.close()
