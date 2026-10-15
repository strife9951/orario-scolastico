import { put, get } from '@vercel/blob';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const userKey = (req.headers.authorization || 'demo').replace('Bearer ', '').replace(/[^a-zA-Z0-9-_]/g, '_') || 'demo';
  const pathname = `users/${userKey}/data.json`;

  try {
    if (req.method === 'GET') {
      try {
        const result = await get(pathname, { access: 'public' });
        if (result.statusCode === 200 && result.stream) {
          const text = await new Response(result.stream).text();
          return res.status(200).json(JSON.parse(text));
        }
      } catch (e) {}
      return res.status(200).json({ studenti: [], orari: {}, libri: {} });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      await put(pathname, JSON.stringify(body), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
      });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Blob error' });
  }
}
