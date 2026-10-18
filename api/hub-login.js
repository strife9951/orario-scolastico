import { loadJson } from "../lib/blobStore.js";
import { signState } from "../lib/passkeyState.js";

const HOST = "school.pkmn.space";

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function readTicket(token, host) {
  const secret = process.env.HUB_SSO_SECRET?.trim();
  if (!secret) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const ok = await crypto.subtle.verify("HMAC", key, base64UrlToBytes(signature), new TextEncoder().encode(body));
  if (!ok) return null;
  try {
    const ticket = JSON.parse(new TextDecoder().decode(base64UrlToBytes(body)));
    if (ticket.host !== host || !ticket.email?.includes("@") || !ticket.exp || ticket.exp < Date.now() / 1000) {
      return null;
    }
    return { email: String(ticket.email).toLowerCase() };
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).end("Metodo non consentito");
    return;
  }
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const ticket = await readTicket(String(req.query.token || ""), host);
  if (!ticket || host !== HOST) {
    res.writeHead(302, { location: "/", "cache-control": "no-store" });
    res.end();
    return;
  }

  let session = "";
  try {
    const key = ticket.email.replace(/[^a-z0-9@._-]/g, "_");
    const user = await loadJson(`passkeys/users/${key}.json`);
    if (user?.credentials?.length) {
      session = signState({
        type: "session",
        email: ticket.email,
        id: user.id,
        credentials: user.credentials,
        exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
      });
    }
  } catch {
    session = "";
  }

  const payload = JSON.stringify({ email: ticket.email, session }).replace(/</g, "\\u003c");
  const html = `<!doctype html><meta charset="utf-8"><title>Accesso</title><script id="hub" type="application/json">${payload}</script><script>var data=JSON.parse(document.getElementById("hub").textContent);localStorage.setItem("orario.email",data.email);if(data.session)localStorage.setItem("orario.session",data.session);location.replace("/");</script>`;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.status(200).send(html);
}
