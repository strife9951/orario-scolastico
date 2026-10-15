// api/data.js — endpoint Vercel per dati centralizzati
// In produzione usa Vercel Blob o Marketplace (Neon/Upstash)

const store = new Map(); // demo in-memory (per demo; in prod usa Blob)

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  const key = req.headers.authorization?.replace("Bearer ", "") || "demo";

  if (req.method === "GET") {
    const data = store.get(key) || { studenti: [], orari: {} };
    return res.status(200).json(data);
  }

  if (req.method === "POST") {
    const body = req.body || {};
    store.set(key, body);
    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: "Method not allowed" });
}
