# Deploy for free (Render)

This app needs a **Node server** (not static-only hosting) because live ASX prices come from `yahoo-finance2`.

## Fastest free option: Render.com

### 1. Put the project on GitHub
1. Create a free GitHub account (if needed)
2. Create a new **public** repo
3. From this folder in PowerShell:

```powershell
cd C:\Users\karth\OneDrive\Desktop\ashokwork
git init
git add .
git commit -m "ASX Sector Intelligence ready to deploy"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### 2. Deploy on Render
1. Go to https://render.com and sign up (GitHub login is easiest)
2. Click **New +** → **Web Service**
3. Connect the GitHub repo
4. Settings:
   - **Runtime:** Node
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Instance type:** Free
5. Click **Create Web Service**

### 3. Share the link
When deploy finishes, Render gives a URL like:

`https://asx-sector-intelligence.onrender.com`

Open that on any phone/laptop — no Cursor needed.

---

## Notes
- Free Render services **sleep after ~15 min idle**. First open after sleep can take 30–60 seconds.
- First load still downloads many ASX tickers; later visits use browser cache for ~6 hours.
- Local test of production build:

```powershell
npm run build
npm start
```

Then open http://localhost:4173
