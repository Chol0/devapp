# NexTech M-Commerce Cloud Functions

This folder contains the secure backend for the AI Shopping Assistant.

## Why this exists
The Flutter mobile app **must not** contain AI provider API keys or secrets. The `chatbotReply` callable Cloud Function:
- requires Firebase Authentication (`request.auth.uid`)
- reads admin-managed config from Firestore `chatbot_config/default`
- reads real product data from Firestore collection `product` (singular, existing collection)
- can call Gemini server-side **only when** `GEMINI_API_KEY` is configured as a Firebase Functions secret
- returns transparent, Firestore-grounded responses when external AI is not configured
- never invents product data and never modifies orders/payments/stock

## Setup
```bash
cd "C:\Users\palen\Downloads\New folder (2)\functions"
npm install
npm run build
```

## Configure the AI secret (manual, do not commit secrets)
```bash
firebase functions:secrets:set GEMINI_API_KEY
```
Then deploy functions:
```bash
firebase deploy --only functions
```

## Billing / cost warning (manual confirmation required)
Using Gemini / Google AI APIs may require a **billing-enabled** Google Cloud project and can incur usage costs (requests, tokens, model choice, region). Review current Google AI / Vertex AI pricing and quotas before enabling production traffic. Do **not** enable paid services automatically.

## Without GEMINI_API_KEY
The function still works using **real Firestore product/config data** and returns `source: "firestore-grounded-fallback"` with a clear note. It does not fabricate AI credentials or invent product facts.

## Firestore collections used
- `chatbot_config/default` — admin-managed store/hours/delivery/FAQs/instructions/suggested questions/active flag
- `product` — existing product catalog (read-only by this function)
- `chatbot_messages` — optional client-side chat history (owner access per Firestore rules; not required for function calls)

## Security notes
- Customers can call the function after signing in.
- Only admins can edit `chatbot_config` (enforced by Firestore rules; publish updated `firestore.rules` manually).
- The function does not expose private customer records and does not write orders/payments/stock.
