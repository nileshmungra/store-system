# 🚀 Deployment Script - Railway
## Bhumi-Store-App with MySQL

This script automates the Railway deployment process.

### Prerequisites
- Git installed
- Node.js & npm installed
- Railway CLI (`npm install -g @railway/cli`)
- GitHub account with repository created
- Railway account (https://railway.app)

### Usage
Double-click this file or run from PowerShell:
```powershell
.\deploy_railway.bat
```

### What This Script Does
1. Checks for Git and Railway CLI
2. Commits any uncommitted changes
3. Pushes code to GitHub
4. Deploys to Railway
5. Shows deployment URL

### Manual Steps Required
After the script runs, set these environment variables in Railway dashboard:
- `ADMIN_PASSWORD` - Your secure admin password
- `API_SECRET_KEY` - Random secret key for API authentication
- `ALLOWED_ORIGINS` - Your domain or `*` for all origins

### Database
- MySQL database is automatically provisioned by Railway
- Database name: `inventory_db`
- Tables are created automatically on first startup

### Post-Deployment
- App URL: `https://Bhumi-Store-App.up.railway.app`
- All HTML pages are served via FastAPI routes
- WebSocket support enabled at `/ws`
