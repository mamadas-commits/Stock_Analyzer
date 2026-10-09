# GitHub Pages Setup Guide

This repository has been configured to deploy to GitHub Pages as a static site.

## What Was Changed

### Configuration Files
1. **next.config.js** - Configured for static export
2. **package.json** - Build scripts for GitHub Pages
3. **.github/workflows/pages.yml** - Automated deployment
4. **.gitignore** - Git ignore patterns
5. **tsconfig.json** - TypeScript configuration

### Build Process
- Next.js compiles TypeScript to static HTML/CSS/JS
- Output goes to `app/out/` directory
- GitHub Actions automatically builds on push to `main`
- Deployed to GitHub Pages from Actions

## Quick Start

### 1. Verify Pages Settings
Go to: https://github.com/mamadas-commits/Stock_Analyzer/settings/pages

Under "Build and deployment":
- ✅ Source: GitHub Actions (selected)

### 2. Push to Main Branch
```bash
git add .
git commit -m "Configure for GitHub Pages"
git push origin main
```

### 3. Monitor Deployment
1. Go to Actions tab
2. Watch "Deploy to GitHub Pages" workflow
3. Wait for green checkmark
4. Access site at: https://mamadas-commits.github.io/Stock_Analyzer/

## Local Development

### Install & Run
```bash
cd app
npm install
npm run dev
```
Visit http://localhost:3000

### Build Locally
```bash
cd app
npm run build
npm start
```

## Architecture Changes

### Before (Desktop)
```
User → Electron/Local Server ← File System
                              ← Node.js Runtime
```

### After (GitHub Pages)
```
User → Browser → GitHub Pages ← Static Files
                              ← IndexedDB/localStorage
```

## Important Limitations & Solutions

### 1. File System Access
**Limitation**: Browser can't access local files
**Solution**: Use IndexedDB or localStorage for data

```javascript
// Instead of: fs.readFile()
const data = localStorage.getItem('stock_data');
// or
const db = new Database('stock_analyzer');
const data = await db.get('stocks');
```

### 2. Server-Side Operations
**Limitation**: No Node.js backend on GitHub Pages
**Solution**: Move to client-side or add API proxy

```javascript
// Instead of: node server doing API calls
// Use: fetch from browser with CORS headers
const response = await fetch('https://sec-api.com/...');
```

### 3. Environment Variables
**Limitation**: No .env.local file on GitHub Pages
**Solution**: Store in localStorage after first setup

```javascript
// In settings form:
localStorage.setItem('tiingo_api_key', userInput);
localStorage.setItem('sec_email', userInput);
```

### 4. Data Persistence
**Limitation**: Browser storage ~5-50MB limit
**Solution**: Implement compression and cleanup

```javascript
// Use compression for large datasets
import pako from 'pako';
const compressed = pako.gzip(JSON.stringify(largeData));
localStorage.setItem('data', btoa(compressed));
```

## Deployment Workflow

```mermaid
Push to main
    ↓
GitHub Actions triggered
    ↓
npm install
    ↓
npm run build (next.js builds to /app/out)
    ↓
Upload /app/out as Pages artifact
    ↓
Deploy to https://mamadas-commits.github.io/Stock_Analyzer/
```

## Troubleshooting

### Error: "Cannot find module 'next'"
```bash
cd app
npm install
```

### Pages showing 404
1. Check Actions tab for build errors
2. Verify Pages is enabled with "GitHub Actions" source
3. Check base path is `/Stock_Analyzer` (check next.config.js)

### API calls blocked by CORS
Solutions:
1. Use CORS proxy: `https://cors-anywhere.herokuapp.com/`
2. Use backend API: Create separate API project
3. Use SEC's official CORS-enabled endpoints

### Data not saving
Check browser Storage (F12 Dev Tools):
- Application → Local Storage
- Application → IndexedDB

Verify storage isn't full and quota isn't exceeded.

## Next Steps for Full Web Migration

1. **Replace file I/O with IndexedDB**
   - Create data access layer
   - Migrate existing data format
   
2. **Move backend logic to API**
   - Create Node.js/Python backend
   - Handle SEC/API calls server-side
   - Deploy to Vercel/Railway/Heroku
   
3. **Update UI for web** (if needed)
   - Remove system tray features
   - Add web-appropriate navigation
   - Responsive design improvements

4. **Add authentication**
   - GitHub Login or email/password
   - Persist user-specific data

5. **Set up backend API**
   ```javascript
   // Backend endpoint for API calls
   const apiUrl = 'https://your-api.com/stocks/data';
   const data = await fetch(apiUrl);
   ```

## Files to Review

- `next.config.js` - Build configuration
- `.github/workflows/pages.yml` - Deployment automation
- `package.json` - Dependencies & scripts
- `app/src/` - Source code (create if doesn't exist)
- `app/out/` - Build output (created after build)

## Support

For GitHub Pages specific issues, see:
- https://docs.github.com/en/pages
- https://nextjs.org/docs/app/building-your-application/deploying/static-exports
- https://github.com/actions/deploy-pages

For Stock Analyzer specific help, see:
- `ctisi-me.txt` (original documentation)
- `README_GITHUB_PAGES.md` (web version guide)
