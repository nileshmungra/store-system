import sys
import time
import socket
import subprocess
import threading
import webbrowser
import re
from database import ensure_mysql_running

# Ports to try in order if the primary port is blocked
PREFERRED_PORTS = [8000, 8080, 8443, 9000, 5000]


def is_port_free(port: int) -> bool:
    """Check if a TCP port is available to bind on this machine."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind(("0.0.0.0", port))
            return True
        except OSError:
            return False


def find_free_port() -> int | None:
    """Return the first available port from PREFERRED_PORTS, or None."""
    for port in PREFERRED_PORTS:
        if is_port_free(port):
            print(f"  ✔ Port {port} is available.")
            return port
        else:
            print(f"  ✖ Port {port} is in use or blocked — trying next...")
    return None


def get_local_ip() -> str:
    """Resolve the LAN IP address of this machine."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"


def start_uvicorn(port: int, use_ssl: bool = True) -> subprocess.Popen:
    """Launch the uvicorn server on the given port."""
    cmd = [
        sys.executable, "-m", "uvicorn", "main:app",
        "--reload",
        "--host", "0.0.0.0",
        "--port", str(port),
        "--no-access-log",
    ]
    if use_ssl:
        cmd += ["--ssl-keyfile", "key.pem", "--ssl-certfile", "cert.pem"]
    return subprocess.Popen(cmd)


def _drain_stdout(process: subprocess.Popen) -> None:
    """
    Continuously read (and discard) cloudflared's stdout in a background
    thread.  If we stop reading, the Windows pipe buffer fills up, the
    process blocks, and the tunnel drops — causing Cloudflare Error 1033.
    """
    try:
        for _ in process.stdout:
            pass
    except Exception:
        pass


def start_cloudflare_tunnel(port: int, use_ssl: bool):
    """
    Start a Cloudflare quick tunnel and return (live_url, tunnel_process).
    Returns None if tunnel creation fails or times out.
    """
    scheme = "https" if use_ssl else "http"
    url    = f"{scheme}://127.0.0.1:{port}"
    cmd    = f"cloudflared.exe tunnel --url {url} --no-tls-verify"

    print(f"\n⏳ Starting Temporary Cloudflare Tunnel → {url} ...")

    try:
        tunnel_process = subprocess.Popen(
            cmd,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
    except FileNotFoundError:
        print("⚠️  cloudflared.exe not found in project folder.")
        return None

    # Give cloudflared up to 30 seconds to produce a URL
    deadline = time.time() + 30

    for line in tunnel_process.stdout:
        stripped = line.strip()
        if stripped:
            print(f"  [cloudflare] {stripped}")

        # Detect fatal errors early so we don't wait the full 30 s
        if any(kw in stripped for kw in [
            "context deadline exceeded",
            "failed to request",
        ]):
            print("⚠️  Cloudflare tunnel encountered an error — stopping tunnel attempt.")
            tunnel_process.terminate()
            return None

        match = re.search(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com', stripped)
        if match:
            live_url = match.group(0)
            # ✅ Keep draining stdout in the background so the pipe never
            #    fills up — this is what keeps the tunnel alive on Windows.
            threading.Thread(
                target=_drain_stdout,
                args=(tunnel_process,),
                daemon=True,
            ).start()
            return live_url, tunnel_process

        if time.time() > deadline:
            print("⚠️  Cloudflare tunnel timed out after 30 seconds.")
            tunnel_process.terminate()
            return None

    tunnel_process.terminate()
    return None


def main():
    print("===================================================")
    print(" INVENTORY SYSTEM - QUICK TEMPORARY TUNNEL STARTER")
    print("===================================================")

    # ── 1. Ensure MySQL is running ────────────────────────────────────────────
    ensure_mysql_running()

    # ── 2. Find a free port ───────────────────────────────────────────────────
    print("\n🔍 Scanning for an available port...")
    port = find_free_port()

    if port is None:
        print("\n❌ No available port found in the list:", PREFERRED_PORTS)
        print("   Please free one of these ports and try again.")
        input("Press Enter to exit...")
        sys.exit(1)

    print(f"\n🚀 Using port {port}")

    # ── 3. Detect whether SSL certs exist ────────────────────────────────────
    import os
    use_ssl = os.path.exists("key.pem") and os.path.exists("cert.pem")
    scheme  = "https" if use_ssl else "http"
    if not use_ssl:
        print("ℹ️  SSL certificates not found — starting without SSL.")

    # ── 4. Start the FastAPI / uvicorn server ─────────────────────────────────
    print(f"\n🔧 Starting FastAPI server on {scheme}://0.0.0.0:{port} ...")
    try:
        server_process = start_uvicorn(port, use_ssl=use_ssl)
    except Exception as e:
        print(f"\n❌ Failed to start uvicorn: {e}")
        input("Press Enter to exit...")
        sys.exit(1)

    time.sleep(3)  # Give uvicorn a moment to bind

    # ── 5. Try Cloudflare tunnel (best-effort) ────────────────────────────────
    live_url       = None
    tunnel_process = None
    tunnel_result  = start_cloudflare_tunnel(port, use_ssl)

    if tunnel_result and isinstance(tunnel_result, tuple):
        live_url, tunnel_process = tunnel_result
        print(f"\n✅ Cloudflare Tunnel active: {live_url}")
    else:
        # Graceful fallback → LAN IP
        local_ip = get_local_ip()
        live_url = f"{scheme}://{local_ip}:{port}"
        print(f"\n⚠️  Cloudflare unavailable — using Local Network URL: {live_url}")
        print("   (Accessible only on this Wi-Fi / LAN network)")

    # ── 6. Print the summary ──────────────────────────────────────────────────
    print("\n===================================================")
    print(f" ✅ LIVE URL: {live_url}")
    print("===================================================")
    print(f" 📌 Dashboard: {live_url}/dashboard")
    print(f" 📌 Scanner:   {live_url}/scanner")
    print(f" 📌 Reports:   {live_url}/report-page")
    print(f" 📌 Log Book:  {live_url}/logs-page")
    print("===================================================")

    # ── 7. Save to file ───────────────────────────────────────────────────────
    try:
        content = (
            f"Dashboard: {live_url}/dashboard\n"
            f"Scanner:   {live_url}/scanner\n"
            f"Reports:   {live_url}/report-page\n"
            f"Log Book:  {live_url}/logs-page"
        )
        with open("LATEST_LIVE_LINK.txt", "w", encoding="utf-8") as f:
            f.write(content)
    except Exception as e:
        print(f"⚠️  File write error: {e}")

    # ── 8. Open dashboard in browser ──────────────────────────────────────────
    webbrowser.open(f"{live_url}/dashboard")

    # ── 9. Keep running until Ctrl+C ─────────────────────────────────────────
    try:
        if tunnel_process:
            tunnel_process.wait()
        else:
            server_process.wait()
    except KeyboardInterrupt:
        print("\n🛑 Shutting down server and tunnel...")
        if tunnel_process:
            tunnel_process.terminate()
        server_process.terminate()


if __name__ == "__main__":
    main()