import sys
import time
import subprocess
import webbrowser
import re
from database import ensure_mysql_running

def main():
    print("===================================================")
    print(" STORE SYSTEM - QUICK TEMPORARY TUNNEL STARTER")
    print("===================================================")

    # Auto-ensure MySQL is running before launching uvicorn
    ensure_mysql_running()

    # FastAPI Server SSL Certificate સાથે ચાલુ કરો
    server_process = subprocess.Popen([
        sys.executable, "-m", "uvicorn", "main:app", 
        "--reload", 
        "--host", "0.0.0.0", 
        "--port", "8000", 
        "--no-access-log",
        "--ssl-keyfile", "key.pem",      # 👈 SSL Key File
        "--ssl-certfile", "cert.pem"     # 👈 SSL Certificate File
    ])
    time.sleep(3)

    print("\n⏳ Starting Temporary Cloudflare Tunnel on port 8000...")

    # SSL હોવાથી tunnel કમાન્ડ https ઉપર પોઈન્ટ કરશે
    cmd = "cloudflared.exe tunnel --url https://127.0.0.1:8000 --no-tls-verify"
    tunnel_process = subprocess.Popen(
        cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1
    )

    live_url = None
    for line in tunnel_process.stdout:
        print(line.strip())
        match = re.search(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com', line)
        if match:
            live_url = match.group(0)
            break

    if not live_url:
        print("\n⚠️ Cloudflare URL જનરેટ થઈ શક્યો નથી. local IP નો ઉપયોગ કરો.")
        live_url = "https://127.0.0.1:8000"

    print("\n===================================================")
    print(f" ✅ TEMPORARY LIVE URL: {live_url}")
    print("===================================================")
    print(f" 📌 Dashboard: {live_url}/dashboard")
    print(f" 📌 Scanner:   {live_url}/scanner")
    print(f" 📌 Reports:   {live_url}/report-page")
    print(f" 📌 Log Book:  {live_url}/logs-page")
    print("===================================================")

    # LATEST_LIVE_LINK.txt માં સેવ કરો
    try:
        content = (
            f"Dashboard: {live_url}/dashboard\n"
            f"Scanner: {live_url}/scanner\n"
            f"Reports: {live_url}/report-page\n"
            f"Log Book: {live_url}/logs-page"
        )
        with open("LATEST_LIVE_LINK.txt", "w", encoding="utf-8") as f:
            f.write(content)
    except Exception as e:
        print(f"File write error: {e}")

    # Browser માં Dashboard ઓપન કરો
    webbrowser.open(f"{live_url}/dashboard")

    try:
        tunnel_process.wait()
    except KeyboardInterrupt:
        print("\n🛑 Shutting down server and tunnel...")
        tunnel_process.terminate()
        server_process.terminate()

if __name__ == "__main__":
    main()