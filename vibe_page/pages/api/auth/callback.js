// pages/api/auth/callback.js
// Uses global fetch instead of node-fetch

import cookie from "cookie";

export default async function handler(req, res) {
  const code = req.query.code;
  if (!code) return res.status(400).send("Missing code");

  // CSRF protection: the nonce embedded in `state` must match the cookie set at /login.
  const reqCookies = cookie.parse(req.headers.cookie || "");
  const expectedNonce = reqCookies.spotify_auth_nonce;
  let stateNonce;
  try {
    if (req.query.state) {
      const payload = JSON.parse(Buffer.from(req.query.state, "base64url").toString("utf8"));
      stateNonce = payload && payload.n;
    }
  } catch (e) {}
  if (!expectedNonce || !stateNonce || expectedNonce !== stateNonce) {
    return res.status(403).send("Invalid OAuth state");
  }

  const redirectUri =
    process.env.SPOTIFY_REDIRECT_URI || `${process.env.NEXT_PUBLIC_BASE_URL || "http://127.0.0.1:3000"}/api/auth/callback`;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: process.env.SPOTIFY_CLIENT_ID,
    client_secret: process.env.SPOTIFY_CLIENT_SECRET,
  });

  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!tokenRes.ok) {
    const txt = await tokenRes.text().catch(() => "");
    return res.status(500).send("Token exchange failed: " + txt);
  }

  const tokens = await tokenRes.json(); // contains access_token, refresh_token, expires_in, maybe scope
  const expiresAt = Date.now() + (tokens.expires_in || 3600) * 1000;

  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  };

  // persist tokens + returned scope for debugging and future checks
  const cookiesToSet = [
    cookie.serialize("spotify_access_token", tokens.access_token, { ...cookieOpts, maxAge: tokens.expires_in }),
    cookie.serialize("spotify_refresh_token", tokens.refresh_token || "", {
      ...cookieOpts,
      maxAge: 30 * 24 * 60 * 60,
    }),
    cookie.serialize("spotify_expires_at", String(expiresAt), { ...cookieOpts, maxAge: tokens.expires_in }),
    cookie.serialize("spotify_scope", tokens.scope || "", { ...cookieOpts, maxAge: tokens.expires_in }),
    // Clear the single-use CSRF nonce now that it has been validated.
    cookie.serialize("spotify_auth_nonce", "", { ...cookieOpts, maxAge: 0 }),
  ];

  res.setHeader("Set-Cookie", cookiesToSet);

  // redirect back to app (state may include redirect_to)
  const state = req.query.state;
  let redirect = "/";
  try {
    if (state) {
      const payload = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
      if (payload && payload.r) redirect = payload.r;
    }
  } catch (e) {}

  res.redirect(redirect);
}