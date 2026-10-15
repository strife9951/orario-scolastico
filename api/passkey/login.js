import { generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { loadJson, saveJson } from '../../lib/blobStore.js';

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
      const user = await loadJson(userPath);
      if (!user?.credentials?.length) return res.status(400).json({ error: 'Nessuna passkey per questa email. Registrala prima.' });

      const options = await generateAuthenticationOptions({
        rpID,
        allowCredentials: user.credentials.map((c) => ({ id: c.id, transports: c.transports })),
        userVerification: 'preferred',
      });
      await saveJson(challengePath, { challenge: options.challenge, type: 'auth' });
      return res.status(200).json(options);
    }

    const stored = await loadJson(challengePath);
    const user = await loadJson(userPath);
    if (!stored || stored.type !== 'auth' || !user) return res.status(400).json({ error: 'Sessione scaduta. Riprova.' });

    const cred = user.credentials.find((c) => c.id === credential.id);
    if (!cred) return res.status(400).json({ error: 'Passkey non riconosciuta' });

    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: stored.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: cred.id,
        publicKey: new Uint8Array(Buffer.from(cred.publicKey, 'base64')),
        counter: cred.counter,
        transports: cred.transports,
      },
    });

    if (!verification.verified) return res.status(400).json({ error: 'Verifica passkey fallita' });

    cred.counter = verification.authenticationInfo.newCounter;
    await saveJson(userPath, user);
    return res.status(200).json({ verified: true, email });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Errore accesso' });
  }
}
