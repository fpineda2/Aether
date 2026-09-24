// pages/api/auth/refresh.js
import cookie from "cookie";
import { refreshAndSetCookies } from "../../../lib/spotifyAuth";

export default async function handler(req, res) {
  const cookies = cookie.parse(req.headers.cookie || "");
  const refreshToken = cookies.spotify_refresh_token;
  if (!refreshToken) return res.status(401).json({ error: "No refresh token" });

  try {
    const tokens = await refreshAndSetCookies(refreshToken, res);
    const expiresAt = Date.now() + (tokens.expires_in || 3600) * 1000;
    // Return the token in the body so internal callers (e.g. /api/auth/token) can read it.
    return res.status(200).json({ ok: true, access_token: tokens.access_token, expires_at: expiresAt });
  } catch (err) {
    return res.status(500).json({ error: "Refresh failed", details: err.message || String(err) });
  }
}
