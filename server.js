require('dotenv').config();
const express = require('express');
const path = require('path');
const { Client } = require('square');

const app = express();
const PORT = process.env.PORT || 3000;

// Determine environment string for Square client
const environment =
  process.env.ENVIRONMENT && process.env.ENVIRONMENT.toLowerCase() === 'production'
    ? 'Production'
    : 'Sandbox';

// Initialize Square client
const squareClient = new Client({
  environment,
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
});

console.log('Square client environment:', environment);

// Serve static files from /public
app.use(express.static(path.join(__dirname, 'public')));

// Example route for health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
