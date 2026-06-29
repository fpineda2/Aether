// pages/api/auth/refresh.js
// Uses the global fetch (no node-fetch import)

import cookie from "cookie";

export default async function handler(req, res) {
  const cookies = cookie.parse(req.headers.cookie || "");
  const refreshToken = cookies.spotify_refresh_token;
  if (!refreshToken) return res.status(401).json({ error: "No refresh token" });

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: process.env.SPOTIFY_CLIENT_ID,
    client_secret: process.env.SPOTIFY_CLIENT_SECRET,
  });

  // Use global fetch (available in Node 18+, and supported by Next.js)
  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!tokenRes.ok) {
    const txt = await tokenRes.text().catch(() => "");
    return res.status(500).json({ error: "Refresh failed", details: txt });
  }

  const tokens = await tokenRes.json();
  const expiresAt = Date.now() + (tokens.expires_in || 3600) * 1000;

  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  };

  const cookiesToSet = [
    cookie.serialize("spotify_access_token", tokens.access_token, { ...cookieOpts, maxAge: tokens.expires_in }),
    cookie.serialize("spotify_expires_at", String(expiresAt), { ...cookieOpts, maxAge: tokens.expires_in }),
  ];

  // Spotify may return a new refresh token; if so, persist it
  if (tokens.refresh_token) {
    cookiesToSet.push(
      cookie.serialize("spotify_refresh_token", tokens.refresh_token, {
        ...cookieOpts,
        maxAge: 30 * 24 * 60 * 60,
      })
    );
  }

  res.setHeader("Set-Cookie", cookiesToSet);
  // Return the token in the body so internal callers (e.g. /api/auth/token) can read it.
  return res.status(200).json({ ok: true, access_token: tokens.access_token, expires_at: expiresAt });
}