import { head, put } from '@vercel/blob';

export function requireBlob() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('Blob non collegato al progetto. Manca BLOB_READ_WRITE_TOKEN su Vercel.');
  }
}

export async function loadJson(path) {
  requireBlob();
  try {
    const meta = await head(path);
    if (!meta?.url) return null;
    const res = await fetch(meta.url);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    const msg = String(err?.message || err);
    if (msg.includes('not found') || msg.includes('BlobNotFound') || err?.status === 404) return null;
    throw err;
  }
}

export async function saveJson(path, data) {
  requireBlob();
  await put(path, JSON.stringify(data), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
}
