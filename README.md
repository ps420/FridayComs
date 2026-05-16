# FridayComs

Desktop AI companion interface - Electron + React.

## Quick Start

```bash
# Backend
cd backend
npm install
npm start

# Frontend (dev)
cd frontend
npm install
npm start

# Electron (desktop app)
cd electron
npm install
npm run dev

# Web server (password: Friday123)
node web-server.js
```

## Deploy to Web

```bash
cd frontend
npm run build
cd ..
node web-server.js
```

Access at `http://localhost:3000`
Password: `Friday123`

## Structure
- `/backend` - Node.js API bridge
- `/frontend` - React app
- `/electron` - Desktop wrapper
- `/*.cs` - Legacy C# CLI (kept intact)
