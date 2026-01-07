# GitHub Actions Deployment Setup

## 🔐 Required GitHub Secrets

Go to your repository → **Settings** → **Secrets and variables** → **Actions**

You need these secrets configured:

### 1. VPS_HOST
```
72.62.194.189
```

### 2. VPS_USER
```
root
```

### 3. VPS_SSH_KEY
Your private SSH key content. To get it:

**On Windows (if you have the key):**
```powershell
Get-Content ~\.ssh\id_rsa
```

**Or generate a new one on your local machine:**
```bash
ssh-keygen -t ed25519 -C "github-actions-deploy"
# Save as: github_deploy_key
# Don't set a passphrase (press Enter)
```

**Then copy the private key:**
```bash
cat github_deploy_key
```

**And add the public key to your VPS:**
```bash
ssh root@72.62.194.189
mkdir -p ~/.ssh
nano ~/.ssh/authorized_keys
# Paste the content of github_deploy_key.pub
# Save and exit
chmod 600 ~/.ssh/authorized_keys
```

### 4. DEPLOY_PATH
```
/var/www/pg-admin-api
```

### 5. VPS_ENV (Auto-update .env file)
This is a **base64 encoded** version of your `.env` file.

**To create it:**
```bash
# On Windows PowerShell
$content = Get-Content "d:\pg-mobile-app\IPMS-ADMIN-web\IPMS-ADMIN-web-api\.env" -Raw
[Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($content))

# Or on Linux/Mac
base64 -w 0 .env
```

Copy the output and add it as the `VPS_ENV` secret in GitHub.

**This allows automatic .env updates on deployment!** 🎉

---

## 🚀 How It Works

### Automatic Deployment
- Push to `main` branch
- Changes in `IPMS-ADMIN-web/IPMS-ADMIN-web-api/**`
- GitHub Actions automatically deploys to VPS

### Manual Deployment
- Go to **Actions** tab
- Select **Deploy Admin API to VPS**
- Click **Run workflow**
- Select branch and run

---

## 📋 Deployment Steps (Automated)

1. ✅ Checkout code
2. ✅ SSH into VPS
3. ✅ Pull latest changes
4. ✅ Install dependencies
5. ✅ Generate Prisma clients
6. ✅ Build application
7. ✅ Restart PM2 process
8. ✅ Save PM2 configuration

---

## 🧪 Test the Workflow

1. Make a small change to any file in `IPMS-ADMIN-web-api`
2. Commit and push to `main` branch
3. Go to GitHub → Actions tab
4. Watch the deployment progress
5. Check your VPS to verify deployment

---

## 🔍 Troubleshooting

### Workflow fails with "Permission denied"
- Check SSH key is correct in secrets
- Verify public key is in VPS `~/.ssh/authorized_keys`

### Workflow fails at "git pull"
- Ensure `/var/www/pg-admin-api` is a git repository
- Run on VPS: `cd /var/www/pg-admin-api && git status`

### PM2 restart fails
- Check PM2 process exists: `pm2 status`
- Verify process name is `pg-admin-api`

---

## ✅ Setup Complete!

Your Admin API will now auto-deploy on every push to main branch! 🎉
