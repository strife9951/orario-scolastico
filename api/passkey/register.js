import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server';
import { loadJson, saveJson } from '../../lib/blobStore.js';
import { newUserId, readBody, readState, signState, siteFrom } from '../../lib/passkeyState.js';

function safeEmail(email) {
  return String(email).toLowerCase().replace(/[^a-z0-9@._-]/g, '_');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito' });

  const { email, credential, state } = readBody(req);
  if (!email || !String(email).includes('@')) return res.status(400).json({ error: 'Email non valida' });

  const { rpID, origin } = siteFrom(req);
  const userPath = `passkeys/users/${safeEmail(email)}.json`;

  try {
    if (!credential) {
      let user = null;
      try { user = await loadJson(userPath); } catch { user = null; }
      user = user || { email, id: newUserId(), credentials: [] };
      if (!user.id) user.id = newUserId();

      const options = await generateRegistrationOptions({
        rpName: 'Il mio orario',
        rpID,
        userName: email,
        userDisplayName: email,
        userID: new TextEncoder().encode(user.id),
        attestationType: 'none',
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred',
        },
        excludeCredentials: (user.credentials || []).map((c) => ({
          id: c.id,
          transports: c.transports,
        })),
      });

      const pending = signState({
        type: 'reg',
        email,
        userId: user.id,
        challenge: options.challenge,
        exp: Date.now() + 5 * 60 * 1000,
      });
      return res.status(200).json({ options, state: pending });
    }

    const pending = readState(state);
    if (pending.type !== 'reg' || pending.email !== email) {
      return res.status(400).json({ error: 'Challenge non valida. Riprova.' });
    }

    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: pending.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Verifica passkey fallita' });
    }

    const cred = verification.registrationInfo.credential;
    let user = null;
    try { user = await loadJson(userPath); } catch { user = null; }
    user = user || { email, id: pending.userId, credentials: [] };
    user.id = user.id || pending.userId;
    user.credentials = (user.credentials || []).filter((c) => c.id !== cred.id);
    user.credentials.push({
      id: cred.id,
      publicKey: Buffer.from(cred.publicKey).toString('base64'),
      counter: cred.counter,
      transports: credential.response?.transports || cred.transports || [],
    });

    let cloud = false;
    try {
      await saveJson(userPath, user);
      cloud = true;
    } catch (err) {
      console.error(err);
    }

    const session = signState({
      type: 'session',
      email,
      id: user.id,
      credentials: user.credentials,
      exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });
    return res.status(200).json({ verified: true, session, cloud });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Errore registrazione' });
  }
}
