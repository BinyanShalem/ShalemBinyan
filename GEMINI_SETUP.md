# Gemini assistant setup

The admin PWA uses `gemini-3.1-flash-lite` through a Firebase callable function. The browser never receives the Gemini API key.

## 1. Create the key and connect billing

1. Sign in to [Google AI Studio API keys](https://aistudio.google.com/api-keys) with the Google account that owns the Firebase project.
2. Select or import the existing Google Cloud/Firebase project `binyanshalem-28b1a`.
3. Click **Create API key** for that project and copy it somewhere private temporarily.
4. Open [Google AI Studio Billing](https://aistudio.google.com/billing), select that project, and click **Set up billing** if it is not already marked Paid.
5. Add or confirm the credit card. Google may require a minimum $10 prepaid credit purchase; that is account credit, not a $10 monthly subscription. Leave auto-reload off initially if strict cost control is preferred.
6. In [AI Studio Spend](https://aistudio.google.com/spend), set the project monthly spend cap to $2 when the control is available. Google labels this cap experimental, so the app also enforces its own request limits.

Do not paste the API key into the PWA, this repository, GitHub settings, or a chat message.

## 2. Store the key in Firebase Secret Manager

From the project root, run:

```bash
npx --yes firebase-tools@latest functions:secrets:set GEMINI_API_KEY --project binyanshalem-28b1a
```

The command prompts for the secret value. Paste the Gemini key into that private terminal prompt.

## 3. Deploy the assistant function

```bash
npx --yes firebase-tools@latest deploy --only functions:adminAssistant --project binyanshalem-28b1a
```

The GitHub Pages frontend also needs the matching admin changes published before the live PWA will use the function.

## Cost and safety controls

- Gemini 3.1 Flash-Lite currently costs $0.25 per million text input tokens and $1.50 per million output tokens on the paid tier.
- The function allows at most 30 assistant requests per Firebase user per UTC day.
- It allows at most 500 assistant requests across the project per UTC month.
- Each request is limited to 500 input characters, six short chat-history items, compact record summaries, and 900 output tokens.
- Full encounter notes, intake issue text, phone numbers, email addresses, and couple contact fields are excluded from the model context.
- Chat messages are not stored by the assistant. Only daily and monthly request counters are written.
- Every write is either opened in a review form or shown with a locally resolved target and effect before the admin confirms it. Creating an intake for someone opens a form with only the name required; all supplied details remain editable and every unsupplied field may stay blank.

At the expected 200–300 short messages per month, model usage should usually cost only cents. The 500-request application cap plus the optional $2 AI Studio project cap provide separate safeguards.

## Authentication

The callable function requires Firebase Authentication. The admin PWA already signs the device in anonymously before loading admin data, so the administrator does not need another login screen after the usual app unlock.

## Troubleshooting

- `Gemini is not configured`: create the secret and redeploy `functions:adminAssistant`.
- `Sign in again`: confirm Anonymous Authentication is enabled in Firebase Authentication.
- `This assistant has reached its daily/monthly limit`: wait for the UTC day/month counter to reset.
- AI Studio shows `No credits` or `Set up Prepay`: finish the billing flow and add the required prepaid balance.
- The smart assistant fails but the menu still works: this is expected fallback behavior; the guided assistant stays available when Gemini is unavailable.
