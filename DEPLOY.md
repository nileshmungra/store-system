# 🚀 Deployment Guide - OCI / Railway

## Option A: Oracle Cloud Infrastructure (OCI) with MySQL

### Prerequisites
- OCI instance (Oracle Linux) with public IP
- MySQL installed on instance or OCI MySQL Database Service

### Step 1: SSH to Instance
```bash
ssh opc@161.118.186.9
```

### Step 2: Run Base Server Setup
```bash
# Upload deploy.sh to instance, then:
bash deploy.sh
```

### Step 3: Upload Project
```powershell
# From Windows PowerShell:
scp -r C:\Users\ADMIN\OneDrive\Desktop\store_system opc@161.118.186.9:/opt/store_app/
```

### Step 4: Run App Setup
```bash
cd /opt/store_app
bash app_setup.sh
nano .env
sudo systemctl start store-app
```

### Step 5: Access
- App: `http://161.118.186.9`
- Logs: `sudo journalctl -u store-app -f`

---

## Option B: Railway Deployment (MySQL)

### Prerequisites
- GitHub account
- Railway account (https://railway.app)

### Step 1: Push Code to GitHub
```bash
cd C:\Users\ADMIN\OneDrive\Desktop\store_system
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/store-system.git
git push -u origin main
```

### Step 2: Deploy on Railway
```bash
npm install -g @railway/cli
railway login
railway init
railway add --plugin mysql
railway up
```

### Step 3: Set Environment Variables
```bash
railway variables set ADMIN_PASSWORD="your_secure_admin_password"
railway variables set API_SECRET_KEY="your_random_secret_key_here"
railway variables set ALLOWED_ORIGINS="https://your-domain.com"
```

### Step 4: Verify
- Open Railway dashboard → Deployments → URL
- Test: `https://your-project.up.railway.app/`

---

## Oracle Database Support (Experimental)

### Prerequisites
- Oracle Database 12c or higher (XE, Standard, or Enterprise)
- `oracledb` Python driver (thin mode recommended)

### Setup

1. **Install Oracle DB driver:**
```bash
pip install oracledb
```

2. **Configure `.env`:**
```env
DB_TYPE=oracle
ORACLE_USER=admin
ORACLE_PASSWORD=your_oracle_password
ORACLE_DSN=localhost:1521/XEPDB1
```

3. **Initialize schema:**
```bash
python database_oracle.py
```

### ⚠️ Important Notes

Oracle DB support is **experimental** and requires query syntax migration. The current `main.py` uses MySQL-specific syntax (`%s` placeholders, `AUTO_INCREMENT`, `IFNULL()`, `DATE_FORMAT()`, etc.).

**To fully enable Oracle DB, you must:**
1. Replace all `cursor.execute("... %s ...", (val,))` with Oracle bind variables `:1, :2`
2. Replace MySQL functions with Oracle equivalents:
   - `IFNULL(a, b)` → `NVL(a, b)`
   - `DATE_FORMAT(date, '%Y-%m-%d')` → `TO_CHAR(date, 'YYYY-MM-DD')`
   - `LIMIT n` → `FETCH FIRST n ROWS ONLY`
3. Replace `AUTO_INCREMENT` with `GENERATED ALWAYS AS IDENTITY`
4. Replace `ENUM` types with `VARCHAR2` + `CHECK` constraints
5. Handle `ON UPDATE CURRENT_TIMESTAMP` via triggers

**Recommendation:** Use MySQL for production. Oracle DB support is provided as a starting point for future migration.

---

## Useful Commands

```bash
# View app logs (OCI)
sudo journalctl -u store-app -f

# Restart app (OCI)
sudo systemctl restart store-app

# MySQL backup
mysqldump -u root -p inventory_db > backup.sql

# Railway logs
railway logs
```
