# 🚀 Deployment Guide - Render.com

## Prerequisites
- GitHub account
- Render.com account (free)

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

## Step 2: Deploy on Render

### Option A: Using render.yaml (RECOMMENDED - Easiest)

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New"** → **"Blueprint"**
3. Connect your GitHub repository
4. Select `store-system` repo
5. Click **"Apply"**

Render will automatically:
- Detect `render.yaml`
- Create MySQL database
- Set all environment variables
- Deploy the API

### Option B: Manual Setup

If blueprint doesn't work:

1. **Create MySQL Database:**
   - Click **"New"** → **"MySQL"**
   - Name: `store-system-db`
   - Plan: `Free`
   - Click **"Create"**

2. **Create Web Service:**
   - Click **"New"** → **"Web Service"**
   - Connect GitHub repo
   - Name: `store-system-api`
   - Runtime: `Python 3`
   - Plan: `Free`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT --workers 2`

3. **Add Environment Variables:**
   - Go to **Environment** tab
   - Add these variables:
   ```
   MYSQL_HOST = <your-mysql-host>
   MYSQL_PORT = <your-mysql-port>
   MYSQL_USER = root
   MYSQL_PASSWORD = <your-mysql-password>
   MYSQL_DATABASE = inventory_db
   API_SECRET_KEY = <generate-random-string>
   ```

---

## Step 3: Update database.py

**Already done!** The code now uses environment variables:
```python
MYSQL_CONFIG = {
    'host': os.getenv('MYSQL_HOST', 'localhost'),
    'port': int(os.getenv('MYSQL_PORT', 3306)),
    'user': os.getenv('MYSQL_USER', 'root'),
    'password': os.getenv('MYSQL_PASSWORD', ''),
    'database': os.getenv('MYSQL_DATABASE', 'inventory_db'),
}
```

---

## Step 4: Deploy

```bash
# Push any changes to GitHub:
git add .
git commit -m "Deploy to Render"
git push origin main

# Render will automatically:
# 1. Detect changes
# 2. Build the app
# 3. Deploy (2-3 minutes)
```

---

## Step 5: Test Deployment

1. Render dashboard ma **"Events"** tab check karo
2. Build successful thaya pachhi **"URL"** copy karo
3. Browser ma URL open karo
4. Test karo:
   - Homepage loads
   - Inward page works
   - Scanner works
   - Reports generate

---

## 🔄 Future Updates

```bash
# Jab pan code update karo:

# 1. Changes check karo:
git status

# 2. Add all files:
git add .

# 3. Commit:
git commit -m "Update: description of changes"

# 4. Push:
git push origin main

# Render automatically deploy thase (2-3 min)
```

---

## 🛠️ Useful Git Commands

```bash
# Status check
git status

# Changes dekhva
git diff

# Specific file commit
git add filename.py
git commit -m "Fix bug"

# Undo last commit (before push)
git reset --soft HEAD~1

# Pull latest changes
git pull origin main

# Create new branch (new feature mate)
git checkout -b feature-name

# Push branch
git push origin feature-name
```

---

## 📊 Free Tier Limits (Render)

| Resource | Limit |
|----------|-------|
| RAM | 512 MB |
| CPU | Shared |
| Bandwidth | 100 GB/month |
| MySQL Storage | 1 GB |
| Always-on | ❌ Spins down after 15 min inactivity |

**Note:** Free tier spins down after 15 minutes of inactivity. First request after spin-down takes ~30 seconds to wake up.

---

## ⚠️ Important Notes

1. **File Uploads:** `static/uploads/` ma uploaded images che. Render free tier ma **disk ephemeral** che (restart/reset thay). Persistent storage mate:
   - Render dashboard → **Disks** → **New Disk**
   - Mount path: `/app/static/uploads`
   - Size: 1 GB (free)

2. **Database Backup:** Render automatic backups kare che, but manually:
   ```bash
   # Render Dashboard → Database → Backups → Export
   ```

3. **Custom Domain:** Free subdomain aapse: `store-system-api.onrender.com`. Custom domain add karva mate:
   - Settings → Custom Domains
   - Domain add karo
   - DNS settings update karo

4. **Logs:** Render dashboard → Logs tab ma real-time logs dekhay

5. **HTTPS:** Automatic SSL certificate (free)

---

## 🆘 Troubleshooting

### Build Failed
```bash
# Common issues:
# 1. Missing requirements.txt → Check karo ke file exists
# 2. Procfile syntax error → Check karo ke correct che
# 3. Port configuration → $PORT variable use karo
```

### Database Connection Error
```bash
# Check karo:
# 1. Environment variables set correctly che ke?
# 2. MySQL service running che ke?
# 3. init_db() properly call thay che ke?
```

### App Crashes
```bash
# Render logs check karo:
# Dashboard → Your Service → Logs
# Common issues:
# - Import errors
# - Missing dependencies
# - Port binding issues
```

---

## 📞 Support

- **Render Docs:** https://render.com/docs
- **FastAPI Docs:** https://fastapi.tiangolo.com/deployment/
- **Project Issues:** GitHub Issues

---

**Deployment successful? Test karo ane enjoy karo! 🎉**
