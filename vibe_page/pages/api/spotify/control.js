// pages/api/spotify/control.js
// POST /api/spotify/control  { action: "play" | "pause", device_id?: "<device id>" }
// Proxies simple playback control to Spotify Web API using the user's access token stored in cookies.
// If device_id is provided for "play", it will be included so playback is directed to that device.

import cookie from "cookie";

async function refreshAccessToken(refreshToken) {
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    throw new Error("Missing Spotify client credentials on server");
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: process.env.SPOTIFY_CLIENT_ID,
    client_secret: process.env.SPOTIFY_CLIENT_SECRET,
  });

  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error("Refresh failed: " + txt);
  }
  const json = await r.json();
  return json; // contains access_token, maybe refresh_token, expires_in, scope
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const cookies = cookie.parse(req.headers.cookie || "");
  let token = cookies.spotify_access_token || null;
  const refreshToken = cookies.spotify_refresh_token || null;

  // helper to set new tokens as cookies on the response
  function setTokenCookies(tokens) {
    const cookieOpts = {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
    };
    const cookiesToSet = [
      cookie.serialize("spotify_access_token", tokens.access_token, { ...cookieOpts, maxAge: tokens.expires_in || 3600 }),
      cookie.serialize("spotify_expires_at", String(Date.now() + (tokens.expires_in || 3600) * 1000), {
        ...cookieOpts,
        maxAge: tokens.expires_in || 3600,
      }),
    ];
    if (tokens.refresh_token) {
      cookiesToSet.push(
        cookie.serialize("spotify_refresh_token", tokens.refresh_token, {
          ...cookieOpts,
          maxAge: 30 * 24 * 60 * 60,
        })
      );
    }
    // set cookies in response (overwrites previous)
    res.setHeader("Set-Cookie", cookiesToSet);
  }

  // If no access token, attempt to refresh (if refresh token exists)
  if (!token && refreshToken) {
    try {
      const tokens = await refreshAccessToken(refreshToken);
      token = tokens.access_token;
      setTokenCookies(tokens);
    } catch (err) {
      console.warn("[/api/spotify/control] refresh failed", err.message || err);
      return res.status(401).json({ error: "No valid access token, refresh failed" });
    }
  }

  if (!token) {
    return res.status(401).json({ error: "No access token available. Please reconnect Spotify." });
  }

  // Expect JSON body with action
  let body = {};
  try {
    body = req.body && typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");
  } catch (e) {
    // ignore parse errors; we'll validate below
  }

  const action = (body.action || "").toLowerCase();
  const deviceId = body.device_id || undefined;

  if (!["play", "pause"].includes(action)) {
    return res.status(400).json({ error: 'Missing or invalid "action" field. Use "play" or "pause".' });
  }

  let endpoint = action === "play" ? "https://api.spotify.com/v1/me/player/play" : "https://api.spotify.com/v1/me/player/pause";
  const options = {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  };

  if (action === "play" && deviceId) {
    // include device_id so Spotify directs playback to the correct device
    options.body = JSON.stringify({ device_ids: [deviceId], play: true });
  }

  async function doProxy(useToken) {
    const r = await fetch(endpoint, options);
    return r;
  }

  try {
    let r = await doProxy(token);
    if (r.status === 401 && refreshToken) {
      // attempt refresh and retry
      try {
        const tokens = await refreshAccessToken(refreshToken);
        setTokenCookies(tokens);
        token = tokens.access_token;
        // update token in options header and retry
        options.headers.Authorization = `Bearer ${token}`;
        r = await doProxy(token);
      } catch (err) {
        console.warn("[/api/spotify/control] refresh during proxy failed", err.message || err);
        return res.status(401).json({ error: "Access token invalid and refresh failed" });
      }
    }

    if (r.ok || r.status === 204) {
      return res.status(204).end();
    } else {
      const txt = await r.text().catch(() => "");
      console.error("[/api/spotify/control] spotify returned error", r.status, txt);
      return res.status(r.status).json({ error: txt || "Spotify API error" });
    }
  } catch (err) {
    console.error("[/api/spotify/control] unexpected error", err);
    return res.status(500).json({ error: "Server error" });
  }
}