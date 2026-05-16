const express = require('express');
const path = require('path');
const app = express();

// Password protection
const AUTH_PASSWORD = 'Friday123';

app.use((req, res, next) => {
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

// API endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static frontend
app.use(express.static(path.join(__dirname, 'frontend/build')));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/build', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FridayComs web server running on port ${PORT}`);
});
