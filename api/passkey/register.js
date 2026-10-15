import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server';
import { loadJson, saveJson } from '../../lib/blobStore.js';

const rpName = 'Il mio orario';

function site(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim();
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const hostname = host.split(':')[0];
  return {
    rpID: process.env.WEBAUTHN_RP_ID || hostname,
    origin: process.env.WEBAUTHN_ORIGIN || `${proto}://${host}`,
  };
}

function bodyOf(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

function safeEmail(email) {
  return String(email).toLowerCase().replace(/[^a-z0-9@._-]/g, '_');
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito' });

  const { email, credential } = bodyOf(req);
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Email non valida' });

  const { rpID, origin } = site(req);
  const key = safeEmail(email);
  const userPath = `passkeys/users/${key}.json`;
  const challengePath = `passkeys/challenges/${key}.json`;

  try {
    if (!credential) {
      const user = (await loadJson(userPath)) || { email, credentials: [] };
      const options = await generateRegistrationOptions({
        rpName,
        rpID,
        userName: email,
        userDisplayName: email,
        attestationType: 'none',
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: 'preferred',
        },
        excludeCredentials: (user.credentials || []).map((c) => ({
          id: c.id,
          transports: c.transports,
        })),
      });
      await saveJson(challengePath, { challenge: options.challenge, type: 'reg' });
      return res.status(200).json(options);
    }

    const stored = await loadJson(challengePath);
    if (!stored || stored.type !== 'reg') return res.status(400).json({ error: 'Challenge scaduta. Riprova.' });

    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: stored.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Verifica passkey fallita' });
    }

    const cred = verification.registrationInfo.credential;
    const user = (await loadJson(userPath)) || { email, credentials: [] };
    user.credentials = (user.credentials || []).filter((c) => c.id !== cred.id);
    user.credentials.push({
      id: cred.id,
      publicKey: Buffer.from(cred.publicKey).toString('base64'),
      counter: cred.counter,
      transports: credential.response?.transports || cred.transports || [],
    });
    await saveJson(userPath, user);
    return res.status(200).json({ verified: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Errore registrazione' });
  }
}
