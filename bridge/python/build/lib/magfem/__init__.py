"""MagFEM: controle o MagFEM (elementos finitos magnéticos 2D no navegador) a partir de scripts."""

from .bridge import DEFAULT_PORT, VERSION, Bridge, BridgeError
from .client import MagFEM, connect

__all__ = ["Bridge", "BridgeError", "MagFEM", "connect", "DEFAULT_PORT", "VERSION"]
__version__ = VERSION
