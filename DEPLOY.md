# 🚀 Deployment Guide - Railway (MySQL)

## Project: Bhumi-Store-App

## Prerequisites
- GitHub account
- Railway account (https://railway.app)
- Node.js & npm installed (for Railway CLI)

---

## Quick Deploy (Recommended)

### Step 1: Clone & Push to GitHub
```bash
cd "E:\MY PROJECT\store qr code app backup\store-system-main"
git add .
git commit -m "Ready for Railway deployment"
git push origin main
```

### Step 2: Deploy via Railway CLI
```bash
npm install -g @railway/cli
railway login
railway init --template express
railway up
```

### Step 3: Set Environment Variables
```bash
railway variables set ADMIN_PASSWORD="your_secure_admin_password"
railway variables set API_SECRET_KEY="your_random_secret_key_here"
railway variables set ALLOWED_ORIGINS="*"
```

### Step 4: Verify
- Open Railway dashboard → Deployments → URL
- Test: `https://Bhumi-Store-App.up.railway.app/`

---

## Manual Deploy via Railway Dashboard

### Step 1: Push Code to GitHub
```bash
cd "E:\MY PROJECT\store qr code app backup\store-system-main"
git add .
git commit -m "Ready for Railway deployment"
git push origin main
```

### Step 2: Create New Project on Railway
1. Go to https://railway.app/dashboard
2. Click **New Project**
3. Select **Deploy from GitHub repo**
4. Choose your repository
5. Railway auto-detects Python and builds

### Step 3: Add MySQL Database
1. In Railway dashboard, click **+ Add** → **Database** → **MySQL**
2. Select plan (free tier available)
3. Railway automatically injects connection env vars:
   - `MYSQLHOST`
   - `MYSQLPORT`
   - `MYSQLUSER`
   - `MYSQLPASSWORD`
   - `MYSQLDATABASE`

### Step 4: Set Environment Variables
In Railway dashboard → Variables:
```
ADMIN_PASSWORD=your_secure_admin_password
API_SECRET_KEY=your_random_secret_key_here
ALLOWED_ORIGINS=*
DB_TYPE=mysql
MYSQL_DATABASE=inventory_db
```

### Step 5: Deploy
Railway auto-deploys on push. If manual deploy needed:
1. Go to Deployments tab
2. Click **Deploy**

---

## Deploy via Railway TOML Config

This project includes `railway.toml` for automated setup:

```bash
npm install -g @railway/cli
railway login
railway up
```

The `railway.toml` configures:
- **Web service**: FastAPI app with uvicorn
- **MySQL database**: `inventory_db` with auto-provisioned credentials
- **Environment variables**: Auto-injected from database connection

---

## What Happens on Deploy

1. **Build Phase**: `pip install -r requirements.txt`
2. **Start Phase**: `uvicorn main:app --host 0.0.0.0 --port $PORT --workers 2`
3. **Database Init**: On startup, `init_db()` creates all tables automatically
4. **Health Check**: App serves at `/` → Dashboard

---

## Post-Deployment

### Access Your App
- **App URL**: `https://Bhumi-Store-App.up.railway.app`
- **Dashboard**: `/` (main_dashboard.html)
- **Scanner**: `/scanner`
- **Items**: `/items-page`
- **Production**: `/production-page`
- **Dispatch**: `/dispatch-page`
- **BOM**: `/bom-page`
- **Challan**: `/challan-page`
- **Report**: `/report-page`
- **Logs**: `/logs-page`

### MySQL Database Management
```bash
# Connect to Railway MySQL
railway connect

# Or via CLI
railway database:connect

# Export backup
mysqldump -u root -p inventory_db > backup.sql
```

### View Logs
```bash
railway logs
railway logs --tail
```

### HTTPS
Automatic SSL/TLS certificate via Let's Encrypt (free, included).

---

## ⚠️ Important Notes

### Database Connection
- On Railway, MySQL is provided as a managed service
- `database.py` auto-detects Railway environment and skips local MySQL auto-start
- Connection details are injected via environment variables (`MYSQLHOST`, `MYSQLPORT`, etc.)
- All tables are created automatically on first startup via `init_db()`

### Static Files
- `static/uploads/` directory persists via Railway disk (if configured)
- Uploaded images and QR code images are stored in `static/uploads/`

### WebSocket Support
- Railway supports WebSocket connections on the `/ws` endpoint
- Real-time updates work on live deployment

---

## Troubleshooting

### Build Failed
```bash
# Check build logs:
railway logs --tail

# Common issues:
# 1. Missing requirements.txt
# 2. Procfile syntax: web: uvicorn main:app --host 0.0.0.0 --port $PORT
# 3. Port must use $PORT env var
```

### Database Connection Error
```bash
# Check:
# 1. MySQL service is running in Railway dashboard
# 2. Environment variables are set correctly
# 3. Railway injects MYSQLHOST, MYSQLPORT, etc. automatically
```

### App Crashes on Startup
```bash
railway logs --tail

# Common issues:
# - Missing ADMIN_PASSWORD or API_SECRET_KEY env vars
# - Port binding issues (must use $PORT)
```

---

## Useful Commands

```bash
# View logs
railway logs

# Stream logs
railway logs --tail

# Connect to database
railway connect

# Run commands on deployed app
railway run python -c "from database import init_db; init_db()"

# Scale up
railway scale web=2

# Restart
railway restart
```

---

## 📞 Support
- **Railway Docs**: https://docs.railway.app
- **FastAPI Deployment**: https://fastapi.tiangoli.com/deployment/
