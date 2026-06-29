// pages/api/auth/token.js
// Returns a valid access token to the client. If expired, refreshes it first.
import cookie from 'cookie';

export default async function handler(req, res) {
  const cookies = cookie.parse(req.headers.cookie || '');
  let access_token = cookies.spotify_access_token;
  const expires_at = Number(cookies.spotify_expires_at || 0);

  // If missing or expired, refresh by calling our refresh endpoint server-side
  if (!access_token || Date.now() > expires_at - 5000) {
    const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://127.0.0.1:3000';
    const refreshResp = await fetch(`${base}/api/auth/refresh`, {
      headers: { cookie: req.headers.cookie || '' },
    });

    if (!refreshResp.ok) {
      return res.status(401).json({ error: 'Unable to refresh token' });
    }

    const data = await refreshResp.json();
    access_token = data.access_token;

    if (!access_token) {
      return res.status(401).json({ error: 'Refresh did not return an access token' });
    }

    // Propagate the refreshed token back to the browser so we don't re-refresh on every call.
    const newExpiresAt = data.expires_at || Date.now() + 3600 * 1000;
    const maxAge = Math.max(0, Math.floor((newExpiresAt - Date.now()) / 1000));
    const cookieOpts = {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge,
    };
    res.setHeader('Set-Cookie', [
      cookie.serialize('spotify_access_token', access_token, cookieOpts),
      cookie.serialize('spotify_expires_at', String(newExpiresAt), cookieOpts),
    ]);
  }

  res.json({ access_token });
}