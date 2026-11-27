// Sign in with Discord — OAuth2 authorization-code flow, no Rich Presence.
//
// The app needs three things from Discord and nothing else: an id, a username
// and an avatar hash. That is exactly the `identify` scope, which does not
// require a bot, a server or any privileged intent.
//
// If DISCORD_CLIENT_ID/SECRET are missing the endpoints answer
// { configured: false } and the header simply shows a Sign in button that
// explains itself, so a fresh install still boots.

import crypto from 'node:crypto';

const API = 'https://discord.com/api/v10';
const AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';

export function discordConfig() {
  return {
    clientId: String(process.env.DISCORD_CLIENT_ID || '').trim(),
    clientSecret: String(process.env.DISCORD_CLIENT_SECRET || '').trim(),
    redirectUri: String(process.env.DISCORD_REDIRECT_URI || '').trim(),
    publicUrl: String(process.env.KOZUTV_PUBLIC_URL || '').trim().replace(/\/+$/, '')
  };
}

export const discordConfigured = () => {
  const c = discordConfig();
  return Boolean(c.clientId && c.clientSecret);
};

// Behind a tunnel or a LAN address the redirect must match what Discord has on
// file, so an explicit DISCORD_REDIRECT_URI always wins; otherwise it is
// derived from the incoming request.
export function redirectUriFor(req) {
  const { redirectUri, publicUrl } = discordConfig();
  if (redirectUri) return redirectUri;
  if (publicUrl) return `${publicUrl}/api/auth/discord/callback`;
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || 'http';
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000').split(',')[0].trim();
  return `${proto}://${host}/api/auth/discord/callback`;
}

// The state value is signed rather than stored, so a restart or a second
// instance never rejects a visitor mid-redirect.
function stateSecret() {
  return String(process.env.AUTH_STATE_SECRET || process.env.DISCORD_CLIENT_SECRET || 'kozu-dev').trim();
}

export function makeState(returnTo = '/browse') {
  const safe = /^\/(?!\/)/.test(returnTo) ? returnTo.slice(0, 300) : '/browse';
  const payload = Buffer.from(JSON.stringify({ r: safe, t: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', stateSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function readState(state) {
  const [payload, sig] = String(state || '').split('.');
  if (!payload || !sig) return null;
  const expect = crypto.createHmac('sha256', stateSecret()).update(payload).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    // Ten minutes is plenty for a sign-in and stops an old link being replayed.
    if (!data || Date.now() - Number(data.t || 0) > 10 * 60_000) return null;
    return { returnTo: /^\/(?!\/)/.test(data.r || '') ? data.r : '/browse' };
  } catch {
    return null;
  }
}

export function authorizeUrl(req, returnTo) {
  const { clientId } = discordConfig();
  if (!clientId) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: 'identify',
    redirect_uri: redirectUriFor(req),
    state: makeState(returnTo),
    prompt: 'consent'
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeCode(req, code) {
  const { clientId, clientSecret } = discordConfig();
  if (!clientId || !clientSecret) throw Error('Discord is not configured.');
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code: String(code),
    redirect_uri: redirectUriFor(req)
  });
  const res = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(12_000)
  });
  if (!res.ok) throw Error(`Discord rejected the sign-in (${res.status}).`);
  return await res.json();
}

export async function fetchProfile(accessToken) {
  const res = await fetch(`${API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(12_000)
  });
  if (!res.ok) throw Error(`Discord did not return a profile (${res.status}).`);
  return await res.json();
}
