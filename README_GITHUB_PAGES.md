# Stock Analyzer - GitHub Pages Edition

This is the GitHub Pages compatible version of Stock Analyzer, a local stock analysis tool.

## Setup for GitHub Pages

### 1. Enable GitHub Pages

1. Go to your repository settings: https://github.com/mamadas-commits/Stock_Analyzer/settings/pages
2. Under "Build and deployment":
   - **Source**: Select "GitHub Actions"
3. Save settings

### 2. Deploy

The site will automatically build and deploy when you:
- Push to the `main` branch
- Trigger the workflow manually from Actions tab

### 3. Access Your Site

Once deployed, your app will be available at:
```
https://mamadas-commits.github.io/Stock_Analyzer/
```

## Development

### Install Dependencies
```bash
npm install
```

### Run Locally
```bash
npm run dev
```
Visit http://localhost:3000

### Build for Production
```bash
npm run build
npm start
```

## Key Changes from Desktop Version

- ✅ Static site export (no Node.js server needed)
- ✅ All data stored in browser localStorage/IndexedDB
- ✅ Works on GitHub Pages free tier
- ⚠️ No local file system access (use browser storage instead)
- ⚠️ CORS considerations for external API calls

## Important Notes

### Data Storage
- Moved from local `data/` directory to browser storage
- Use localStorage for settings
- Use IndexedDB for large datasets (stock prices, SEC data)
- Consider service workers for offline functionality

### API Calls
- SEC data requests may need CORS proxy or backend
- Tiingo API calls should use environment variables
- Yahoo Finance requests subject to browser CORS policy

### Authentication
- Settings stored in localStorage with encryption recommended
- No .env.local file on GitHub Pages
- Use GitHub Secrets for sensitive data in build process

## Troubleshooting

### Site not found at GitHub Pages URL
- Verify Pages are enabled in repository settings
- Check GitHub Actions workflow succeeded (Actions tab)
- Wait 1-2 minutes after push for deployment

### APIs not working
- Check browser console (F12) for CORS errors
- Consider using a backend API proxy
- Verify API keys in localStorage

### Data not persisting
- Check browser storage limits (usually 5-50MB)
- Use IndexedDB for better performance
- Consider compression for large datasets

## Migration Path

To fully migrate from desktop to web:

1. **Frontend**: All UI code remains the same
2. **Data Layer**: Replace file I/O with IndexedDB
3. **API Integration**: Update to work with browser CORS
4. **Build Process**: Handled by GitHub Actions workflow
5. **Deployment**: Automatic on push to main

For questions, check the original documentation in `ctisi-me.txt`.
