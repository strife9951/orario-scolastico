import { loadJson, saveJson } from '../lib/blobStore.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const userKey = (req.headers.authorization || 'demo').replace('Bearer ', '').replace(/[^a-zA-Z0-9-_]/g, '_') || 'demo';
  const pathname = `users/${userKey}/data.json`;

  try {
    if (req.method === 'GET') {
      const stored = await loadJson(pathname);
      return res.status(200).json(stored || { studenti: [], orari: {}, libri: {} });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      await saveJson(pathname, body);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Blob error' });
  }
}
