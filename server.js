const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Correctly serve /public as static
app.use(express.static(path.join(__dirname, 'public')));

// Debug logging for requests
app.get('*', (req, res, next) => {
    console.log('Request URL:', req.originalUrl);
    next();
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
