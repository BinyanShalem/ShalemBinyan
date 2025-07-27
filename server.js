require('dotenv').config();
const express = require('express');
const path = require('path');
const { Client, Environment } = require('square');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Square client
const squareClient = new Client({
  environment: Environment.Sandbox, // switch to Environment.Production when ready
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
 * Example API endpoint to create a payment
 * You would call this from your frontend to process the payment
 * Make sure to handle amount, sourceId (nonce), etc. on client and server
 */
app.post('/api/payment', async (req, res) => {
  try {
    const { sourceId, amount, idempotencyKey } = req.body;

    if (!sourceId || !amount || !idempotencyKey) {
      return res.status(400).json({ error: 'Missing required payment fields' });
    }

    const paymentsApi = squareClient.paymentsApi;

    // Amount in cents, example: 1000 = $10.00
    const paymentResponse = await paymentsApi.createPayment({
      sourceId,
      idempotencyKey,
      amountMoney: {
        amount: parseInt(amount), 
        currency: 'USD',
      },
    });

    return res.json(paymentResponse.result);
  } catch (error) {
    console.error('Payment error:', error);
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
