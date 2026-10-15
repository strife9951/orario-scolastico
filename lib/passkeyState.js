import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

function secret() {
  return process.env.WEBAUTHN_SECRET || 'orario-passkey-static-v3';
}

export function signState(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function readState(token) {
  if (!token || !String(token).includes('.')) throw new Error('Sessione passkey non valida');
  const [body, sig] = String(token).split('.');
  const expected = createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('Sessione passkey non valida');
  const data = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (data.exp && data.exp < Date.now()) throw new Error('Sessione scaduta. Riprova.');
  return data;
}

export function newUserId() {
  return randomBytes(16).toString('base64url');
}

export function siteFrom(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost')
    .split(',')[0]
    .trim();
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  return {
    rpID: process.env.WEBAUTHN_RP_ID || host.split(':')[0],
    origin: process.env.WEBAUTHN_ORIGIN || `${proto}://${host}`,
  };
}

export function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}
