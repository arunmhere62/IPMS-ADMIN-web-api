# 🚀 GitHub Actions Auto-Deployment Setup

## ✅ What's Configured

Your Admin API now has **automatic deployment** with:
- ✅ Auto-deploy on push to `main` branch
- ✅ Auto-update `.env` file from GitHub secrets
- ✅ Prisma client generation
- ✅ Zero-downtime deployment with PM2

---

## 📋 Quick Setup Checklist

### Step 1: Encode Your .env File

Run this PowerShell script:
```powershell
cd d:\pg-mobile-app\IPMS-ADMIN-web\IPMS-ADMIN-web-api
.\encode-env.ps1
```

This will:
- Read your `.env` file
- Encode it to base64
- Copy to clipboard
- Display the value

### Step 2: Update GitHub Secret

1. Go to your GitHub repository
2. **Settings** → **Secrets and variables** → **Actions**
3. Find **VPS_ENV** secret
4. Click **Update**
5. Paste the base64 value from Step 1
6. Click **Update secret**

### Step 3: Verify Other Secrets

Make sure these are set correctly:

| Secret | Value |
|--------|-------|
| `VPS_HOST` | `72.62.194.189` |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | Your SSH private key |
| `DEPLOY_PATH` | `/var/www/pg-admin-api` |
| `VPS_ENV` | Base64 encoded .env (from Step 1) |

### Step 4: Test Deployment

```bash
cd d:\pg-mobile-app\IPMS-ADMIN-web\IPMS-ADMIN-web-api
git add .
git commit -m "Setup auto-deployment"
git push origin main
```

Then watch it deploy:
- Go to GitHub → **Actions** tab
- See the deployment in progress
- Check logs if any issues

---

## 🎯 How It Works

### On Every Push to Main:

1. **Git Reset**: Clean pull from GitHub
2. **Update .env**: Decode and write .env from secret
3. **Install Dependencies**: `npm install --legacy-peer-deps`
4. **Generate Prisma**: `npm run prisma:generate:all`
5. **Build**: `npm run build`
6. **Restart PM2**: Zero-downtime reload
7. **Save PM2**: Persist configuration

---

## 🔄 Updating .env in Production

**Never SSH to update .env manually!** Instead:

1. Update `.env` locally
2. Run `.\encode-env.ps1`
3. Update `VPS_ENV` secret in GitHub
4. Push any change to trigger deployment
5. .env automatically updates on server! 🎉

---

## 🧪 Manual Deployment Trigger

If you want to deploy without code changes:

1. Go to GitHub → **Actions** tab
2. Select **Deploy NestJS API** workflow
3. Click **Run workflow**
4. Select `main` branch
5. Click **Run workflow**

---

## 🐛 Troubleshooting

### Deployment Fails at "env decode failed"

- Your `VPS_ENV` secret is not valid base64
- Run `.\encode-env.ps1` again and update the secret

### Deployment Fails at "git reset"

- VPS directory is not a git repository
- SSH to VPS and run:
  ```bash
  cd /var/www/pg-admin-api
  git init
  git remote add origin <your-repo-url>
  git fetch
  git reset --hard origin/main
  ```

### PM2 Restart Fails

- Check PM2 process name is `pg-admin-api`
- SSH to VPS: `pm2 status`
- If wrong name, update workflow file

---

## ✅ You're All Set!

Your Admin API will now:
- ✅ Auto-deploy on every push
- ✅ Auto-update .env from GitHub
- ✅ Zero-downtime deployments
- ✅ Full deployment logs in GitHub

**No more manual SSH deployments needed!** 🎉
