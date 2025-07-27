// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const { Client, Environment } = require('square');
const { v4: uuidv4 } = require('uuid'); // For generating unique idempotency keys
const cors = require('cors'); // Import cors

const app = express();
const port = process.env.PORT || 3000; // Use port 3000 or specified by environment

// Middleware to parse JSON request bodies
app.use(bodyParser.json());

// Enable CORS for all origins during development.
// In a production environment, you should restrict this to your frontend's domain for security.
// Example for production: app.use(cors({ origin: 'https://your-frontend-domain.com' }));
app.use(cors()); 

// Retrieve Square credentials from environment variables
const accessToken = process.env.SQUARE_ACCESS_TOKEN;
// Determine Square environment based on the .env variable
const squareEnvironment = process.env.SQUARE_ENVIRONMENT === 'production' ? Environment.Production : Environment.Sandbox;

// Initialize Square client
const squareClient = new Client({
  accessToken: accessToken,
  environment: squareEnvironment,
});

// Destructure the PaymentsApi from the client
const { paymentsApi } = squareClient;

// Endpoint to process Square payments
app.post('/process-square-payment', async (req, res) => {
  console.log('Received payment request:', req.body);

  const { token, amount, currency, email, name } = req.body;

  // Basic validation for required fields
  if (!token || !amount || parseFloat(amount) <= 0 || !currency) {
    console.error('Missing required payment data.');
    return res.status(400).json({ success: false, error: 'Missing required payment data.' });
  }

  // Generate a unique idempotency key for the payment request
  // This prevents duplicate charges if the request is retried
  const idempotencyKey = uuidv4();

  try {
    const requestBody = {
      sourceId: token, // The tokenized card nonce from the frontend
      amountMoney: {
        // Square API expects amount in cents (or smallest currency unit).
        // Ensure the amount is an integer.
        amount: Math.round(parseFloat(amount)), 
        currency: currency,
      },
      idempotencyKey: idempotencyKey,
      // Optional: Add buyer details for better reporting in Square Dashboard
      buyerEmailAddress: email,
      // You can add more metadata if needed
      // referenceId: `donation-for-${name}`, 
      // note: `Donation from ${name}`
    };

    console.log('Square API request body:', requestBody);

    // Call the Square Payments API to create the payment
    const { result } = await paymentsApi.createPayment(requestBody);

    console.log('Square API response:', result);

    // Check if the payment was successfully completed
    if (result.payment && result.payment.status === 'COMPLETED') {
      res.status(200).json({ success: true, payment: result.payment });
    } else {
      // Handle cases where payment was not completed successfully (e.g., declined, failed)
      const errorMessages = result.errors ? result.errors.map(err => err.detail).join(', ') : 'Payment failed.';
      console.error('Payment not completed:', errorMessages, result.errors);
      res.status(400).json({ success: false, error: errorMessages });
    }

  } catch (error) {
    console.error('Error processing payment:', error.result || error);
    // Square API errors often have a 'result' property with more details
    const errorMessage = error.result && error.result.errors && error.result.errors.length > 0
      ? error.result.errors.map(err => err.detail).join(', ')
      : error.message || 'An unexpected error occurred.';
    res.status(500).json({ success: false, error: errorMessage });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Backend server listening at http://localhost:${port}`);
  console.log('Remember to set your SQUARE_ACCESS_TOKEN and SQUARE_ENVIRONMENT in the .env file.');
  console.log('For testing, ensure SQUARE_ENVIRONMENT is set to "sandbox".');
});
