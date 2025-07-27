require('dotenv').config();
const express = require('express');
const path = require('path');
const { Client } = require('square'); // Removed Environment from destructuring
const { v4: uuidv4 } = require('uuid'); // Add this line to import uuid

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Square client
const squareClient = new Client({
  environment: Client.environments.Sandbox, // Corrected: Access Sandbox via Client.environments
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
});

app.use(express.json()); // to parse JSON bodies
app.use(express.static(path.join(__dirname, 'public')));

// Serve the donate page explicitly (optional)
app.get('/donate', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'donate', 'index.html'));
});

// Simple health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

/**
 * API endpoint to create a payment
 * It receives 'nonce' (Square's sourceId) and 'amount' from the frontend.
 * The 'idempotencyKey' is generated on the server for transaction uniqueness.
 */
app.post('/api/payment', async (req, res) => {
  try {
    const { nonce, amount } = req.body; // Expect 'nonce' from client, not 'sourceId'
    const idempotencyKey = uuidv4(); // Generate a unique idempotency key for each payment attempt

    if (!nonce || !amount) {
      return res.status(400).json({ error: 'Missing required payment fields: nonce or amount' });
    }

    const paymentsApi = squareClient.paymentsApi;

    // Amount in cents, example: 1000 = $10.00
    const paymentResponse = await paymentsApi.createPayment({
      sourceId: nonce, // Use 'nonce' received from the client as 'sourceId'
      idempotencyKey,
      amountMoney: {
        amount: parseInt(amount), 
        currency: 'USD',
      },
    });

    return res.json(paymentResponse.result);
  } catch (error) {
    console.error('Payment error:', error);
    // Provide a more user-friendly error message if possible
    return res.status(500).json({ error: error.message || 'Payment failed' });
  }
});

// Fallback to serve index.html for SPA (optional)
// app.get('*', (req, res) => {
//   res.sendFile(path.join(__dirname, 'public', 'index.html'));
// });

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});