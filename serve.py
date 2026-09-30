#!/usr/bin/env python3
"""Local web server for XRPBlocks.

Serves this folder on http://localhost so that ES modules and Web Serial work,
and tells the browser never to cache anything.

That last part matters. Chrome caches JavaScript modules aggressively, so after
an edit you can end up running a new toolbox.js against an old blocks file. The
toolbox then asks for a block the browser has never heard of and Blockly raises
"Invalid block definition for type: ...", which breaks that category's flyout
and every category opened after it. No-store headers make that impossible.

Usage:  python serve.py [port]
"""

import http.server
import os
import socket
import socketserver
import sys
import threading
import webbrowser

DEFAULT_PORT = 8765


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    """Static file handler that forbids caching."""

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # One tidy line per request, without the date noise.
        sys.stdout.write("  %s\n" % (fmt % args))
        sys.stdout.flush()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    root = os.path.dirname(os.path.abspath(__file__))
    os.chdir(root)

    if not os.path.exists("index.html"):
        print("ERROR: index.html was not found in this folder:")
        print("   " + root)
        return 1

    try:
        port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    except ValueError:
        print("Port must be a number.")
        return 1

    address = "http://localhost:%d/" % port

    try:
        httpd = Server(("127.0.0.1", port), NoCacheHandler)
    except OSError as err:
        if getattr(err, "errno", None) in (48, 98, 10048):
            print("ERROR: port %d is already in use." % port)
            print("Close the other server, or run:  python serve.py %d" % (port + 1))
        else:
            print("ERROR: could not start the server: %s" % err)
        return 1

    print("Serving folder:")
    print("   " + root)
    print()
    print("   Address: " + address)
    print()
    print("Nothing is cached, so a normal refresh always loads your latest edit.")
    print("Leave this window OPEN while you work. Close it to stop the server.")
    print()

    threading.Timer(1.5, lambda: webbrowser.open(address)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
