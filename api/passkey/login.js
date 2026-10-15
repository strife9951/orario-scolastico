import { generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { loadJson, saveJson } from '../../lib/blobStore.js';
import { readBody, readState, signState, siteFrom } from '../../lib/passkeyState.js';

function safeEmail(email) {
  return String(email).toLowerCase().replace(/[^a-z0-9@._-]/g, '_');
}

async function findUser(email, session) {
  const path = `passkeys/users/${safeEmail(email)}.json`;
  try {
    const fromBlob = await loadJson(path);
    if (fromBlob?.credentials?.length) return { user: fromBlob, path, cloud: true };
  } catch { /* blob assente */ }
  if (session) {
    const data = readState(session);
    if (data.type === 'session' && data.email === email && data.credentials?.length) {
      return { user: data, path, cloud: false };
    }
  }
  return { user: null, path, cloud: false };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito' });

  const { email, credential, session, state } = readBody(req);
  if (!email || !String(email).includes('@')) return res.status(400).json({ error: 'Email non valida' });

  const { rpID, origin } = siteFrom(req);

  try {
    if (!credential) {
      const found = await findUser(email, session);
      if (!found.user) {
        return res.status(400).json({ error: 'Nessuna passkey per questa email. Registrala prima, da questo browser.' });
      }
      const options = await generateAuthenticationOptions({
        rpID,
        allowCredentials: found.user.credentials.map((c) => ({ id: c.id, transports: c.transports })),
        userVerification: 'preferred',
      });
      const pending = signState({
        type: 'auth',
        email,
        challenge: options.challenge,
        exp: Date.now() + 5 * 60 * 1000,
      });
      return res.status(200).json({ options, state: pending });
    }

    const pending = readState(state);
    if (pending.type !== 'auth' || pending.email !== email) {
      return res.status(400).json({ error: 'Challenge non valida. Riprova.' });
    }
    const found = await findUser(email, session);
    if (!found.user) return res.status(400).json({ error: 'Passkey non trovata' });

    const cred = found.user.credentials.find((c) => c.id === credential.id);
    if (!cred) return res.status(400).json({ error: 'Passkey non riconosciuta' });

    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: pending.challenge,
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
    try { await saveJson(found.path, { email, id: found.user.id, credentials: found.user.credentials }); } catch { /* locale */ }

    const next = signState({
      type: 'session',
      email,
      id: found.user.id,
      credentials: found.user.credentials,
      exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });
    return res.status(200).json({ verified: true, session: next });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Errore accesso' });
  }
}
