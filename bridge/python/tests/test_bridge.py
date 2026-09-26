"""Testes da ponte com um "navegador" falso (cliente WebSocket mínimo em socket puro)."""

import base64
import json
import os
import socket
import struct
import threading
import unittest
import urllib.error
import urllib.request

from magfem import Bridge, BridgeError, MagFEM


def free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


class FakeBrowser:
    """Conecta em /ws, manda o hello e responde cada 'run' com o código em maiúsculas."""

    def __init__(self, port: int, key: str, origin: str = "http://localhost:3002"):
        self.sock = socket.create_connection(("127.0.0.1", port))
        k = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall(
            (
                f"GET /ws HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                f"Sec-WebSocket-Key: {k}\r\nSec-WebSocket-Version: 13\r\nOrigin: {origin}\r\n\r\n"
            ).encode()
        )
        head = b""
        while b"\r\n\r\n" not in head:
            head += self.sock.recv(1)
        self.status = int(head.split(b" ")[1])
        if self.status == 101:
            self.send({"type": "hello", "key": key})

    def send(self, obj) -> None:
        data = json.dumps(obj).encode()
        mask = os.urandom(4)
        n = len(data)
        head = bytes([0x81]) + (bytes([0x80 | n]) if n < 126 else struct.pack(">BH", 0x80 | 126, n))
        self.sock.sendall(head + mask + bytes(c ^ mask[i % 4] for i, c in enumerate(data)))

    def recv(self):
        def read(n):
            b = b""
            while len(b) < n:
                chunk = self.sock.recv(n - len(b))
                if not chunk:
                    raise ConnectionError
                b += chunk
            return b

        b0, b1 = read(2)
        n = b1 & 0x7F
        if n == 126:
            (n,) = struct.unpack(">H", read(2))
        elif n == 127:
            (n,) = struct.unpack(">Q", read(8))
        data = read(n)
        if b0 & 0x0F == 0x8:
            return None
        return json.loads(data)

    def serve(self) -> None:
        while True:
            try:
                m = self.recv()
            except (ConnectionError, OSError):
                return
            if m is None:
                return
            if m.get("type") == "run":
                if m["code"] == "fail":
                    self.send({"type": "result", "id": m["id"], "ok": False, "error": "falhou", "line": "fail"})
                else:
                    self.send({"type": "result", "id": m["id"], "ok": True, "value": m["code"].upper(), "out": []})


class BridgeTest(unittest.TestCase):
    def setUp(self):
        self.port = free_port()
        self.bridge = Bridge(port=self.port, key="segredo").start()

    def tearDown(self):
        self.bridge.stop()

    def test_run_through_browser(self):
        br = FakeBrowser(self.port, "segredo")
        self.assertEqual(br.status, 101)
        self.assertEqual(br.recv()["type"], "welcome")
        threading.Thread(target=br.serve, daemon=True).start()
        mf = MagFEM(port=self.port, key="segredo", start=False)
        self.assertTrue(mf.status()["browser"])
        self.assertEqual(mf.run("s.solve()"), "S.SOLVE()")
        with self.assertRaises(BridgeError) as e:
            mf.run("fail")
        self.assertIn("falhou", str(e.exception))
        br.sock.close()

    def test_form_request(self):
        # Octave/Matlab: formulário key=...&code=...
        br = FakeBrowser(self.port, "segredo")
        br.recv()
        threading.Thread(target=br.serve, daemon=True).start()
        post = lambda body: json.loads(urllib.request.urlopen(urllib.request.Request(
            f"http://127.0.0.1:{self.port}/run", data=body.encode(), headers={"Content-Type": "application/x-www-form-urlencoded"}), timeout=5).read())
        self.assertEqual(post("key=segredo&code=s.solve%28%29")["value"], "S.SOLVE()")
        bad = post("key=errada&code=x")
        self.assertFalse(bad["ok"])
        self.assertIn("chave", bad["error"])
        br.sock.close()

    def test_wrong_key_http(self):
        mf = MagFEM(port=self.port, key="errada", start=False)
        with self.assertRaises(BridgeError) as e:
            mf.run("x")
        self.assertIn("chave", str(e.exception))

    def test_wrong_key_browser(self):
        br = FakeBrowser(self.port, "errada")
        self.assertEqual(br.recv()["type"], "error")
        self.assertFalse(MagFEM(port=self.port, key="segredo", start=False).status()["browser"])
        br.sock.close()

    def test_foreign_origin_rejected(self):
        br = FakeBrowser(self.port, "segredo", origin="https://example.com")
        self.assertEqual(br.status, 403)
        br.sock.close()

    def test_no_browser(self):
        mf = MagFEM(port=self.port, key="segredo", start=False)
        with self.assertRaises(BridgeError) as e:
            mf.run("x")
        self.assertIn("nenhuma página", str(e.exception))


if __name__ == "__main__":
    unittest.main()
