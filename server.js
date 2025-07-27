require('dotenv').config();
const express = require('express');
const path = require('path');
const { Client, Environment } = require('square');

const app = express();
const PORT = process.env.PORT || 3000;

// Square client setup
const squareClient = new Client({
  environment: Environment.Sandbox, // Change to Environment.Production when ready
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Serve static files from /public
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint to process payment
app.post('/process-payment', async (req, res) => {
  const { nonce, amount, buyerEmail } = req.body;

  if (!nonce || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const paymentsApi = squareClient.paymentsApi;

    const requestBody = {
      sourceId: nonce,
      amountMoney: {
        amount: parseInt(amount, 10), // in cents
        currency: 'USD',
      },
      locationId: process.env.SQUARE_LOCATION_ID,
      buyerEmailAddress: buyerEmail,
      idempotencyKey: crypto.randomUUID(),
    };

    const { result } = await paymentsApi.createPayment(requestBody);

    res.json({ success: true, payment: result.payment });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Payment processing failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
