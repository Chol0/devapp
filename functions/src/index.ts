import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

initializeApp();

const db = getFirestore();
// Configure with: firebase functions:secrets:set GEMINI_API_KEY
// Billing: Gemini API / Google AI Studio or Vertex AI may require a billing-enabled Google Cloud project
// and can incur usage costs. Review current Google pricing before enabling production traffic.
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

type ChatRequest = { message?: string; history?: Array<{ role: string; content: string }> };

type ProductDoc = {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  stock: number;
  imageUrl: string;
};

function num(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function normalizeProduct(id: string, data: Record<string, unknown>): ProductDoc {
  return {
    id,
    name: String(data.name ?? data.Name ?? data.productName ?? "Unnamed product"),
    description: String(data.description ?? data.desc ?? ""),
    price: num(data.price ?? data.sellingPrice ?? data.unitPrice ?? data.amount, 0),
    category: String(data.category ?? data.Category ?? "Uncategorized"),
    stock: Math.max(0, Math.trunc(num(data.stock ?? data.quantity ?? data.qty ?? data.inventory, 0))),
    imageUrl: String(data.imageUrl ?? data.image_url ?? data.imageURL ?? data.photoUrl ?? data.thumbnail ?? data.image ?? ""),
  };
}

type ChatbotOverride = { keywords: string; response: string };

async function getActiveConfig() {
  const snap = await db.collection("chatbot_config").doc("default").get();
  const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};
  return {
    active: data.active !== false,
    storeName: String(data.storeName ?? "NexTech M-Commerce"),
    storeAddress: String(data.storeAddress ?? ""),
    storePhone: String(data.storePhone ?? ""),
    storeOwner: String(data.storeOwner ?? ""),
    businessHours: String(data.businessHours ?? ""),
    deliveryInfo: String(data.deliveryInfo ?? ""),
    faqs: String(data.faqs ?? ""),
    chatbotInstructions: String(data.chatbotInstructions ?? ""),
    defaultReply: String(data.defaultReply ?? data.fallbackReply ?? ""),
    suggestedQuestions: Array.isArray(data.suggestedQuestions)
      ? data.suggestedQuestions.map((v) => String(v)).filter(Boolean).slice(0, 8)
      : [
          "Recommend products under ₱1000",
          "What laptops do you have?",
          "How do I place an order?",
          "What are your store hours?",
          "What is your delivery information?",
        ],
    responseOverrides: Array.isArray(data.responseOverrides)
      ? (data.responseOverrides as any[])
          .map((v) => ({ keywords: String(v?.keywords ?? "").trim(), response: String(v?.response ?? "").trim() }))
          .filter((v) => v.keywords && v.response)
      : [] as ChatbotOverride[],
  };
}

function matchAdminOverride(message: string, overrides: ChatbotOverride[]): string | null {
  const q = message.toLowerCase();
  for (const o of overrides) {
    const keys = o.keywords.toLowerCase().split(/[,;\n]+/).map((s) => s.trim()).filter((s) => s.length >= 2);
    for (const k of keys) if (q.includes(k)) return o.response;
  }
  return null;
}

async function getProducts(): Promise<ProductDoc[]> {
  const snap = await db.collection("product").get();
  return snap.docs.map((d) => normalizeProduct(d.id, d.data() as Record<string, unknown>));
}

function extractBudget(message: string): number | null {
  const m = message.match(/(?:₱|php|p|under|below|less than|budget(?: of)?|up to|max(?:imum)?)\s*([0-9][0-9,]*(?:\.[0-9]+)?)|([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:pesos|php|₱)/i);
  const raw = m?.[1] || m?.[2];
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function pickRelevantProducts(message: string, products: ProductDoc[]): ProductDoc[] {
  const q = message.toLowerCase();
  const budget = extractBudget(message);
  let filtered = products;
  if (budget != null) filtered = filtered.filter((p) => p.price > 0 && p.price <= budget);
  const tokens = q.split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
  const scored = filtered.map((p) => {
    const hay = `${p.name} ${p.category} ${p.description}`.toLowerCase();
    let score = 0;
    for (const t of tokens) if (hay.includes(t)) score += t.length > 3 ? 2 : 1;
    if (budget != null && p.price <= budget) score += 1;
    return { p, score };
  });
  scored.sort((a, b) => b.score - a.score || a.p.price - b.p.price);
  const selected = scored.filter((s) => s.score > 0 || budget != null).slice(0, 8).map((s) => s.p);
  return selected.length ? selected : filtered.slice(0, 8);
}

function buildGroundedContext(config: Awaited<ReturnType<typeof getActiveConfig>>, products: ProductDoc[], message: string): string {
  const relevant = pickRelevantProducts(message, products);
  const productLines = relevant.map((p) =>
    `- ${p.name} | category: ${p.category} | price: ₱${p.price.toLocaleString()} | stock: ${p.stock} | description: ${p.description || "N/A"} | imageUrl: ${p.imageUrl || "N/A"} | id: ${p.id}`
  );
  return [
    `STORE INFORMATION`,
    `Store: ${config.storeName}`,
    `Address: ${config.storeAddress || "Not configured"}`,
    `Phone: ${config.storePhone || "Not configured"}`,
    `Owner: ${config.storeOwner || "Not configured"}`,
    `Business hours: ${config.businessHours || "Not configured"}`,
    `Delivery information: ${config.deliveryInfo || "Not configured"}`,
    `FAQs: ${config.faqs || "Not configured"}`,
    `Admin instructions: ${config.chatbotInstructions || "Be helpful and factual."}`,
    ``,
    `REAL FIRESTORE PRODUCTS (from collection "product"; do not invent products/prices/stock):`,
    productLines.length ? productLines.join("\n") : "- No matching products found in Firestore.",
    ``,
    `SAFETY RULES:`,
    `- Use only the store info and Firestore product data above.`,
    `- Never invent product names, prices, stock, categories, specifications, or store facts.`,
    `- Never modify orders, payments, product stock, or any database records.`,
    `- Do not expose private customer information.`,
    `- If information is missing, say it is not available in the current store/product data.`,
    `- You may explain how to place an order in general app terms: browse products, add to cart, enter delivery info, choose payment, submit checkout; admins process order/payment status.`,
  ].join("\n");
}

async function callGemini(apiKey: string, prompt: string): Promise<string | null> {
  const model = "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 700 },
  };
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.error("[chatbot] Gemini API error", res.status, txt);
    return null;
  }
  const json = await res.json() as any;
  const text = json?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || "").join("").trim();
  return text || null;
}

export const chatbotReply = onCall({ region: "us-central1", secrets: [GEMINI_API_KEY], cors: true, timeoutSeconds: 60 }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Please sign in to use the AI shopping assistant.");

  const data = request.data as ChatRequest;
  const message = String(data?.message || "").trim();
  if (!message) throw new HttpsError("invalid-argument", "Message is required.");
  if (message.length > 1500) throw new HttpsError("invalid-argument", "Message is too long.");

  const [config, products] = await Promise.all([getActiveConfig(), getProducts()]);
  if (!config.active) {
    return {
      reply: "The AI shopping assistant is currently unavailable. Please contact the store or try again later.",
      source: "disabled",
      suggestedQuestions: config.suggestedQuestions,
    };
  }

  // Highest priority: admin-typed responses saved in Firebase (chatbot_config/default.responseOverrides).
  const override = matchAdminOverride(message, config.responseOverrides);
  if (override) {
    return { reply: override, source: "admin-firebase-config", suggestedQuestions: config.suggestedQuestions };
  }

  const context = buildGroundedContext(config, products, message);
  const history = Array.isArray(data.history) ? data.history.slice(-8) : [];
  const historyText = history.map((h) => `${h.role === "assistant" ? "Assistant" : "Customer"}: ${String(h.content || "").slice(0, 400)}`).join("\n");
  const prompt = `${context}\n\nConversation history:\n${historyText || "(none)"}\n\nCustomer message:\n${message}\n\nAssistant reply:`;

  let apiKey = "";
  try { apiKey = GEMINI_API_KEY.value() || ""; } catch { apiKey = ""; }

  if (apiKey) {
    const ai = await callGemini(apiKey, prompt);
    if (ai) return { reply: ai, source: "gemini", suggestedQuestions: config.suggestedQuestions };
  }

  // Transparent fallback: no fake AI claims; returns grounded Firestore/store information.
  const budget = extractBudget(message);
  const relevant = pickRelevantProducts(message, products);
  const q = message.toLowerCase();
  let reply = "";
  if (/\b(hour|open|close|time|address|location|phone|contact|owner|store)\b/.test(q)) {
    reply = `Store information (admin-configured):\n- Store: ${config.storeName}\n- Address: ${config.storeAddress || "Not configured"}\n- Phone: ${config.storePhone || "Not configured"}\n- Owner: ${config.storeOwner || "Not configured"}\n- Business hours: ${config.businessHours || "Not configured"}`;
  } else if (/\b(deliver|shipping|ship|pickup|cod|cash on delivery)\b/.test(q)) {
    reply = `Delivery information (admin-configured):\n${config.deliveryInfo || "Delivery information is not configured yet."}`;
  } else if (/\b(order|checkout|buy|cart|purchase|pay)\b/.test(q)) {
    reply = `How to place an order:\n1. Browse products in the app.\n2. Add items to your cart.\n3. Open Cart and confirm quantities.\n4. Enter complete delivery information in Profile/checkout.\n5. Choose a payment method and provide reference/proof if required.\n6. Submit checkout. Your order is saved to Firestore and admins can process order/payment status.\n\nDelivery info: ${config.deliveryInfo || "Not configured."}`;
  } else if (budget != null || /\b(recommend|suggest|budget|cheap|afford|under|category|price|stock|available)\b/.test(q)) {
    if (!relevant.length) {
      reply = `I could not find matching products in Firestore collection "product"${budget != null ? ` for budget ₱${budget.toLocaleString()}` : ""}.`;
    } else {
      reply = `Real products from Firestore${budget != null ? ` within about ₱${budget.toLocaleString()}` : ""}:\n` +
        relevant.map((p) => `- ${p.name} (${p.category}) — ₱${p.price.toLocaleString()}, stock: ${p.stock}${p.description ? `, ${p.description}` : ""}`).join("\n") +
        `\n\nI only listed data from the product collection. Ask about a specific product name for details.`;
    }
  } else if (/\b(faq|question|return|refund|warranty)\b/.test(q)) {
    reply = `FAQs / store guidance (admin-configured):\n${config.faqs || "No FAQs configured yet."}`;
  } else {
    reply = relevant.length
      ? `I can help using real store/product data. Matching products from Firestore:\n${relevant.slice(0, 5).map((p) => `- ${p.name} — ₱${p.price.toLocaleString()} (${p.category}, stock ${p.stock})`).join("\n")}\n\nAsk about budget, category, price, stock, specs, store hours/address/phone, delivery, or how to place an order.`
      : (config.defaultReply?.trim() || `I can help with store information, delivery, ordering steps, and real products from Firestore. ${config.faqs ? `\n\nFAQs:\n${config.faqs}` : "No matching product data was found for that question."}`);
  }

  return {
    reply,
    source: "firestore-grounded-fallback",
    aiConfigured: false,
    suggestedQuestions: config.suggestedQuestions,
    note: "Server-side Gemini/AI provider is not configured. This response used real Firestore product/config data only. Configure GEMINI_API_KEY as a Firebase Functions secret to enable external AI generation.",
  };
});

// Optional admin callable to verify role (used by admin UI for clearer errors; rules remain source of truth)
export const getMyAdminStatus = onCall({ region: "us-central1", cors: true }, async (request) => {
  if (!request.auth?.uid) return { isAdmin: false };
  const snap = await db.collection("users").doc(request.auth.uid).get();
  return { isAdmin: snap.data()?.role === "admin" };
});
