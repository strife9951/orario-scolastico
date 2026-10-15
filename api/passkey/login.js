import { generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { put, get } from '@vercel/blob';

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
      const user = await loadJson(userPath);
      if (!user || !user.credentials?.length) return res.status(400).json({ error: 'no passkey registered' });

      const options = await generateAuthenticationOptions({
        rpID,
        allowCredentials: user.credentials.map(c => ({ id: c.id, transports: c.transports })),
        userVerification: 'preferred',
      });
      await saveJson(challengePath, { challenge: options.challenge, type: 'auth' });
      return res.status(200).json(options);
    }

    if (req.method === 'POST' && credential) {
      const stored = await loadJson(challengePath);
      const user = await loadJson(userPath);
      if (!stored || stored.type !== 'auth' || !user) return res.status(400).json({ error: 'invalid state' });

      const cred = user.credentials.find(c => c.id === credential.id);
      if (!cred) return res.status(400).json({ error: 'credential not found' });

      const verification = await verifyAuthenticationResponse({
        response: credential,
        expectedChallenge: stored.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        authenticator: {
          credentialID: cred.id,
          credentialPublicKey: Buffer.from(cred.publicKey, 'base64'),
          counter: cred.counter,
        },
      });

      if (!verification.verified) return res.status(400).json({ error: 'verification failed' });

      cred.counter = verification.authenticationInfo.newCounter;
      await saveJson(userPath, user);

      return res.status(200).json({ verified: true, email });
    }

    return res.status(405).end();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
