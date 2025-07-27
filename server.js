const express = require('express');
const bodyParser = require('body-parser');
const { Client, Environment } = require('square');

const app = express();
const PORT = process.env.PORT || 3000;

// Square API Client
const squareClient = new Client({
    environment: Environment.Sandbox, // Change to 'Production' in production
    accessToken: 'EAAAl9hrMDN2J518tMHkNvCFDfrFTWzHKCvp88z5LDkQgHXUveRr1QvRK1PC7p_g' // <-- REPLACE with your actual access token
});

// Middleware
app.use(bodyParser.json());
app.use(express.static('public')); // Serve static files from 'public' folder

// Payment Route
app.post('/process-payment', async (req, res) => {
    const { sourceId, amount, email, name } = req.body;

    try {
        const paymentsApi = squareClient.paymentsApi;
        const response = await paymentsApi.createPayment({
            sourceId: sourceId,
            idempotencyKey: new Date().getTime().toString(),
            amountMoney: {
                amount: parseInt(amount) * 100, // Convert to cents
                currency: 'USD'
            },
            buyerEmailAddress: email,
            note: `Donation from ${name}`
        });

        res.json({ success: true, payment: response.result.payment });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
