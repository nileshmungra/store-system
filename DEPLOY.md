# 🚀 Deployment Guide - Railway

## Prerequisites

- GitHub account
- Railway account (free - https://railway.app)
- Python 3.12 (for local testing)
- MySQL database (Railway provisioned or local)

---

## Step 1: Push Code to GitHub

```bash
cd C:\Users\ADMIN\OneDrive\Desktop\store_system

git init
git add .
git commit -m "Initial commit for deployment"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/store-system.git
git push -u origin main
```

---

## Step 2: Deploy on Railway

### Option A: Using Railway CLI (RECOMMENDED - Easiest)

1. **Install Railway CLI:**
   ```bash
   npm install -g @railway/cli
   ```

2. **Login to Railway:**
   ```bash
   railway login
   ```

3. **Initialize project from GitHub repo:**
   ```bash
   railway init
   ```
   - Select **"Create new project"**
   - Enter project name: `store-system`
   - Select your GitHub repository

4. **Add MySQL plugin:**
   ```bash
   railway add --plugin mysql
   ```
   Railway automatically provisions a MySQL database and sets the following environment variables:
   - `MYSQLHOST`
   - `MYSQLPORT`
   - `MYSQLUSER`
   - `MYSQLPASSWORD`
   - `MYSQLDATABASE`

5. **Set remaining environment variables:**
   ```bash
   railway variables set ADMIN_PASSWORD="your_secure_admin_password"
   railway variables set API_SECRET_KEY="your_random_secret_key_here"
   railway variables set ALLOWED_ORIGINS="https://your-domain.com"
   ```

6. **Deploy:**
   ```bash
   railway up
   ```
   Railway will:
   - Detect `railway.toml`
   - Install dependencies from `requirements.txt`
   - Set up MySQL via the plugin
   - Deploy the API using the `Procfile`
   - Assign a live URL

### Option B: Via Railway Dashboard (GitHub Integration)

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click **"New Project"** → **"Deploy from GitHub"**
3. Connect your GitHub repository
4. Select the `store-system` repo
5. **Add a Plugin:**
   - Click **"+ New"** → **"Plugin"** → Select **"MySQL"**
   - Railway creates MySQL and injects env vars automatically
6. **Add Variables** (Settings → Variables):
   ```
   ADMIN_PASSWORD = your_secure_admin_password
   API_SECRET_KEY = your_random_secret_key_here
   ALLOWED_ORIGINS = https://your-domain.com
   ```
7. Click **"Deploy"** — Railway auto-builds using `requirements.txt` and `Procfile`

---

## Step 3: Environment Variables

### Auto-provisioned by Railway MySQL plugin:
| Variable | Description |
|----------|-------------|
| `MYSQLHOST` | MySQL host address |
| `MYSQLPORT` | MySQL port (MySQL 8: 3306) |
| `MYSQLUSER` | MySQL user |
| `MYSQLPASSWORD` | MySQL password |
| `MYSQLDATABASE` | Database name |
| `MYSQL_URL` | Full connection URL |

### Manually configured:
| Variable | Description | Example |
|----------|-------------|---------|
| `ADMIN_PASSWORD` | Admin login password | `securePass123!` |
| `API_SECRET_KEY` | JWT/API token secret | `a1b2c3d4e5f6...` |
| `ALLOWED_ORIGINS` | Comma-separated allowed CORS origins | `https://myapp.com` |

**Note:** The code in `database.py` automatically reads env vars with fallback to `MYSQLHOST`/`MYSQLPORT` (Railway-style) and `MYSQL_HOST`/`MYSQL_PORT` (custom-style).

---

## Step 4: Verify Deployment

1. Check the **"Deployments"** tab for build status
2. Once deployed, go to **"Settings"** → **"Domain"** to find your live URL
3. Open the URL and verify:
   - Homepage loads at `/`
   - Dashboard loads at `/dashboard`
   - Scanner page at `/scanner`
   - API responds at `/api/auth/token`

---

## 🔄 Future Updates

```bash
# Whenever you make code changes:

# 1. Check working tree:
git status

# 2. Add files:
git add .

# 3. Commit:
git commit -m "Update: description of changes"

# 4. Push:
git push origin main

# 5. Trigger deploy (if auto-deploy is off):
railway up

# Railway automatically deploys on push to main (2-3 minutes)
```

---

## 🛠️ Useful Git Commands

```bash
# Status check
git status

# View changes
git diff

# Stage and commit a specific file
git add filename.py
git commit -m "Fix bug"

# Undo last commit (before push)
git reset --soft HEAD~1

# Pull latest changes
git pull origin main

# Create a new branch for a feature
git checkout -b feature-name

# Push a branch
git push origin feature-name
```

---

## 📊 Free Tier Limits (Railway)

| Resource | Limit |
|----------|-------|
| RAM | 512 MB (shared) |
| Disk Storage | 1 GB |
| Bandwidth | 1 TB/month |
| MySQL Storage | 1 GB |
| Always-on | ❌ Spins down after 30 min inactivity |
| Deployments | 500 hours/month |

**Note:** The free tier includes $5 of credit per month. The MySQL plugin uses MySQL 8 and spins down after 30 minutes of inactivity on free plans.

---

## ⚠️ Important Notes

1. **File Uploads:** `static/uploads/` stores uploaded images. Railway's filesystem is **ephemeral** on the free tier (resets on redeploy/restart). For production:
   - Use a persistent volume via Railway's **"Storage"** plugin, or
   - Use an object storage service (S3-compatible)

2. **Database Backup:** Railway provides automatic backups for the MySQL plugin. Manual export:
   ```bash
   railway connect mysql
   ```
   Or via the Railway dashboard → Database → Backups.

3. **Custom Domain:** Railway assigns a free subdomain like `store-system.up.railway.app`. To add a custom domain:
   - Settings → Domains → "Add Domain"
   - Enter your domain and follow DNS setup instructions

4. **Logs:** Real-time logs are available in the Railway dashboard under **"Deployments"** → click a deployment → **"Logs"**
   ```bash
   # Or stream logs locally:
   railway logs
   ```

5. **HTTPS:** Automatic SSL/TLS certificate via Let's Encrypt (free, included).

6. **`runtime.txt`:** Pin your Python version for reproducible builds.
   ```
   python-3.12.0
   ```

---

## 🆘 Troubleshooting

### Build Failed
```bash
# Common issues:
# 1. Missing requirements.txt -> ensure the file exists at project root
# 2. Procfile syntax -> check it reads: web: uvicorn main:app --host 0.0.0.0 --port $PORT
# 3. Port configuration -> always use $PORT env var, never hardcode
# 4. Check build logs:
railway logs --tail
```

### Database Connection Error
```bash
# Check:
# 1. MySQL plugin is added and started in Railway dashboard
# 2. Environment variables MYSQLHOST, MYSQLPORT, etc. are set
# 3. database.py auto-reads MYSQLHOST/MYSQLPORT (Railway convention)
# 4. init_db() runs on startup to create tables
```

### App Crashes on Startup
```bash
# Check Railway deployment logs:
railway logs --tail

# Common issues:
# - Import errors (missing packages in requirements.txt)
# - Missing environment variables (ADMIN_PASSWORD, API_SECRET_KEY)
# - Port binding issues (must use $PORT)
```

### "address already in use" on local
```bash
# If running locally, check port 8000:
netstat -ano | findstr :8000
# Then kill the PID if needed:
taskkill /PID <PID> /F
```

---

## 📞 Support

- **Railway Docs:** https://docs.railway.app
- **FastAPI Deployment:** https://fastapi.tiangoli.com/deployment/
- **Project Issues:** GitHub Issues

---

**Deployment successful? Test it and enjoy! 🎉**
