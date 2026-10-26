# Servidor estático para jugar en local: python servidor.py  →  http://localhost:8000
# Los módulos de JavaScript necesitan servirse por HTTP con el tipo correcto; abrir index.html con doble clic no funciona.
import functools
import http.server
import os
import sys


class Juego(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript; charset=utf-8", ".html": "text/html; charset=utf-8", ".glb": "model/gltf-binary"}


puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
carpeta = os.path.dirname(os.path.abspath(__file__))
print(f"Cobreseco en http://localhost:{puerto}")
http.server.ThreadingHTTPServer(("127.0.0.1", puerto), functools.partial(Juego, directory=carpeta)).serve_forever()
