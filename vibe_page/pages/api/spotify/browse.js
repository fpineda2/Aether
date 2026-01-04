// pages/api/spotify/browse.js
// GET /api/spotify/browse
// Tries the user's access token first (from cookie). If the user's token returns partial
// results (e.g. featured returns 404 but categories OK), return the available parts to the client.
// Only falls back to client-credentials (app) token when the user token yields no usable data.
// Caches the app token in-memory until expiry.

import cookie from "cookie";

let appToken = null;
let appTokenExpiresAt = 0; // unix ms

async function getAppAccessToken() {
  const now = Date.now();
  if (appToken && appTokenExpiresAt - 5000 > now) return appToken;

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Missing Spotify client credentials on server");

  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({ grant_type: "client_credentials" });

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Failed to fetch app token: ${res.status} ${txt}`);
  }

  const json = await res.json();
  appToken = json.access_token;
  appTokenExpiresAt = Date.now() + (json.expires_in || 3600) * 1000;
  return appToken;
}

async function fetchBrowseWithToken(token) {
  const headers = { Authorization: `Bearer ${token}` };

  const [featuredRes, catsRes] = await Promise.all([
    fetch("https://api.spotify.com/v1/browse/featured-playlists?limit=8", { headers }),
    fetch("https://api.spotify.com/v1/browse/categories?limit=8", { headers }),
  ]);

  return { featuredRes, catsRes };
}

async function parseMaybe(res) {
  if (!res) return { ok: false, status: 0, body: null, text: "" };
  const status = res.status;
  if (res.ok) {
    try {
      const body = await res.json();
      return { ok: true, status, body, text: "" };
    } catch (e) {
      const txt = await res.text().catch(() => "");
      return { ok: false, status, body: null, text: txt };
    }
  } else {
    const txt = await res.text().catch(() => "");
    return { ok: false, status, body: null, text: txt };
  }
}

export default async function handler(req, res) {
  const cookies = cookie.parse(req.headers.cookie || "");
  const userToken = cookies.spotify_access_token;

  async function attemptToken(token) {
    const { featuredRes, catsRes } = await fetchBrowseWithToken(token);
    const [featuredParsed, catsParsed] = await Promise.all([parseMaybe(featuredRes), parseMaybe(catsRes)]);
    return {
      featured: featuredParsed,
      categories: catsParsed,
      rawStatus: { featured: featuredRes ? featuredRes.status : null, categories: catsRes ? catsRes.status : null },
    };
  }

  try {
    // 1) Try user token first (if present)
    if (userToken) {
      try {
        const result = await attemptToken(userToken);

        // both endpoints OK -> return personalized data
        if (result.featured.ok && result.categories.ok) {
          return res.status(200).json({
            playlists: result.featured.body.playlists || result.featured.body,
            categories: result.categories.body,
            source: "user",
          });
        }

        // If categories OK but featured missing (e.g. 404), return categories only (user context)
        if (result.categories.ok && !result.featured.ok) {
          return res.status(200).json({
            playlists: null,
            categories: result.categories.body,
            source: "user",
            note: "featured_unavailable_for_user_token",
            featuredStatus: result.featured.status,
            featuredText: result.featured.text || "",
          });
        }

        // If featured OK but categories missing, return featured only
        if (result.featured.ok && !result.categories.ok) {
          return res.status(200).json({
            playlists: result.featured.body.playlists || result.featured.body,
            categories: null,
            source: "user",
            note: "categories_unavailable_for_user_token",
            categoriesStatus: result.categories.status,
            categoriesText: result.categories.text || "",
          });
        }

        // If either endpoint returned 401 -> token auth/scopes issue => fall back to app token
        if (result.featured.status === 401 || result.categories.status === 401) {
          console.warn("[/api/spotify/browse] user token unauthorized (401) - falling back to app token");
        } else {
          // partial/other statuses: log and fall back to app token to try generic data
          console.warn("[/api/spotify/browse] user token attempt returned partial/other statuses", result.rawStatus, {
            featuredText: result.featured.text,
            categoriesText: result.categories.text,
          });
        }
        // fall through to app token fallback
      } catch (err) {
        console.warn("[/api/spotify/browse] user token attempt failed:", err.message || err);
      }
    }

    // 2) Fallback: try app (client-credentials) token (generic public browse)
    const appAccessToken = await getAppAccessToken();
    const appResult = await attemptToken(appAccessToken);

    const playlists = appResult.featured.ok ? (appResult.featured.body.playlists || appResult.featured.body) : null;
    const categories = appResult.categories.ok ? appResult.categories.body : null;

    if (playlists || categories) {
      return res.status(200).json({
        playlists,
        categories,
        source: "app",
      });
    }

    // If app token also failed entirely, return helpful debug info
    console.error(
      "[/api/spotify/browse] app token attempt failed",
      appResult.rawStatus,
      { featuredText: appResult.featured.text, categoriesText: appResult.categories.text }
    );

    return res.status(500).json({
      error: "Spotify browse failed",
      details: {
        userTokenProvided: !!userToken,
        appTokenStatus: appResult.rawStatus,
        featuredError: appResult.featured.text,
        categoriesError: appResult.categories.text,
      },
    });
  } catch (err) {
    console.error("[/api/spotify/browse] unexpected error:", err.message || err);
    return res.status(500).json({ error: err.message || "Spotify browse failed" });
  }
}