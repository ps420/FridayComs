const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

const AUTH_PASSWORD = process.env.PASSWORD || 'Friday123';

// Security middleware
app.use((req, res, next) => {
  if (req.path === '/api/health') return next();
  
  const auth = req.headers.authorization;
  if (!auth) {
    res.set('WWW-Authenticate', 'Basic realm="FridayComs"');
    return res.status(401).send('Authentication required');
  }
  
  const credentials = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':');
  if (credentials[1] !== AUTH_PASSWORD) {
    res.set('WWW-Authenticate', 'Basic realm="FridayComs"');
    return res.status(401).send('Invalid password');
  }
  
  next();
});

// API routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Find and serve static frontend
let buildPath = path.join(__dirname, 'frontend/build');
if (!fs.existsSync(buildPath)) {
  buildPath = path.join(__dirname, 'build');
}

console.log('Serving static files from:', buildPath);

if (fs.existsSync(buildPath)) {
  app.use(express.static(buildPath));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
  });
} else {
  app.get('*', (req, res) => {
    res.send('Build not found. Please check deployment.');
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FridayComs running on port ${PORT}`);
});
