import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server';
import { put, get } from '@vercel/blob';

const rpName = 'Il mio orario';
const rpID = process.env.WEBAUTHN_RP_ID || 'orario-scolastico-striker21.vercel.app';
const origin = process.env.WEBAUTHN_ORIGIN || 'https://orario-scolastico-striker21.vercel.app';

async function loadJson(path) {
  try {
    const res = await get(path, { access: 'public' });
    if (res.statusCode === 200 && res.stream) {
      const text = await new Response(res.stream).text();
      return JSON.parse(text);
    }
  } catch {}
  return null;
}

async function saveJson(path, data) {
  await put(path, JSON.stringify(data), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { email, credential } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });

  const userPath = `passkeys/users/${email.replace(/[^a-zA-Z0-9@._-]/g, '_')}.json`;
  const challengePath = `passkeys/challenges/${email.replace(/[^a-zA-Z0-9@._-]/g, '_')}.json`;

  try {
    if (req.method === 'POST' && !credential) {
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
        excludeCredentials: user.credentials.map(c => ({ id: c.id, transports: c.transports })),
      });
      await saveJson(challengePath, { challenge: options.challenge, type: 'reg' });
      return res.status(200).json(options);
    }

    if (req.method === 'POST' && credential) {
      const stored = await loadJson(challengePath);
      if (!stored || stored.type !== 'reg') return res.status(400).json({ error: 'no challenge' });

      const verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge: stored.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
      });

      if (!verification.verified || !verification.registrationInfo) {
        return res.status(400).json({ error: 'verification failed' });
      }

      const { credential: cred } = verification.registrationInfo;
      const user = (await loadJson(userPath)) || { email, credentials: [] };
      user.credentials.push({
        id: cred.id,
        publicKey: Buffer.from(cred.publicKey).toString('base64'),
        counter: cred.counter,
        transports: cred.transports,
      });
      await saveJson(userPath, user);
      return res.status(200).json({ verified: true });
    }

    return res.status(405).end();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
