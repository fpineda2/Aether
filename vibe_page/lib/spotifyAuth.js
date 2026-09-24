// lib/spotifyAuth.js
// Shared Spotify token-refresh helpers for API routes. This is the single
// place that knows how to exchange a refresh token for a new access token
// and turn that into Set-Cookie headers — routes that can hit a 401 (or
// start with no access token at all) import from here instead of keeping
// their own copy of this logic.

import cookie from "cookie";

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

function baseCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  };
}

// Exchanges a refresh token for a new access token. Throws on missing
// server credentials or a non-2xx response from Spotify.
export async function refreshAccessToken(refreshToken) {
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    throw new Error("Missing Spotify client credentials on server");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: process.env.SPOTIFY_CLIENT_ID,
    client_secret: process.env.SPOTIFY_CLIENT_SECRET,
  });

  const r = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error("Refresh failed: " + txt);
  }

  return r.json(); // { access_token, refresh_token?, expires_in, scope? }
}

// Builds the Set-Cookie values for a token response. `spotify_refresh_token`
// is only included when Spotify actually rotated it.
export function buildTokenCookies(tokens) {
  const opts = baseCookieOptions();
  const expiresIn = tokens.expires_in || 3600;

  const cookies = [
    cookie.serialize("spotify_access_token", tokens.access_token, { ...opts, maxAge: expiresIn }),
    cookie.serialize("spotify_expires_at", String(Date.now() + expiresIn * 1000), { ...opts, maxAge: expiresIn }),
  ];

  if (tokens.refresh_token) {
    cookies.push(
      cookie.serialize("spotify_refresh_token", tokens.refresh_token, { ...opts, maxAge: REFRESH_TOKEN_MAX_AGE })
    );
  }

  return cookies;
}

// Convenience for the common case: refresh, then immediately write the
// resulting Set-Cookie header onto the response. Returns the new tokens.
export async function refreshAndSetCookies(refreshToken, res) {
  const tokens = await refreshAccessToken(refreshToken);
  res.setHeader("Set-Cookie", buildTokenCookies(tokens));
  return tokens;
}
