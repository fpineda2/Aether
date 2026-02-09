// pages/api/auth/login.js
import querystring from "querystring";
import cookie from "cookie";
import crypto from "crypto";

export default function handler(req, res) {
  const redirectTo = req.query.redirect_to || "/dashboard";
  const redirectUri =
    process.env.SPOTIFY_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/auth/callback`;

  const scopes = [
    "streaming",
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing",
    "user-read-private",
    "user-read-email",
    "user-library-read",              // ← ADDED: Read saved tracks
    "playlist-read-private",          // ← ADDED: Read playlists (you already have this working, but good to be explicit)
    "playlist-read-collaborative",    // ← ADDED: Read collaborative playlists
  ].join(" ");

  const nonce = crypto.randomBytes(16).toString("hex");
  const statePayload = Buffer.from(JSON.stringify({ r: redirectTo, n: nonce })).toString("base64url");

  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 10 * 60,
  };

  res.setHeader("Set-Cookie", cookie.serialize("spotify_auth_nonce", nonce, cookieOpts));

  const params = querystring.stringify({
    response_type: "code",
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope: scopes,
    redirect_uri: redirectUri,
    show_dialog: true,
    state: statePayload,
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
}