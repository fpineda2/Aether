// pages/api/spotify/play.js
// POST /api/spotify/play
// Handles playing both individual tracks and playlists/albums
import cookie from "cookie";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const cookies = cookie.parse(req.headers.cookie || "");
  const token = cookies.spotify_access_token;
  
  if (!token) {
    return res.status(401).json({ error: "No access token" });
  }

  try {
    const { uri, context_uri, device_id, position } = req.body;
    
    console.log("🎵 Play request:", { uri, context_uri, device_id, position });

    // Build the request body for Spotify API
    const playBody = {};
    
    if (device_id) {
      playBody.device_id = device_id;
    }

    // If context_uri is provided (playlist/album), use that
    if (context_uri) {
      playBody.context_uri = context_uri;
      
      // If position is provided, use it (track number in playlist, 0-indexed)
      if (position !== null && position !== undefined) {
        playBody.offset = { position: position };
      }
      // Otherwise if uri is provided, use it as the starting track within the context
      else if (uri) {
        playBody.offset = { uri: uri };
      }
    } 
    // Otherwise, if just uri is provided (single track)
    else if (uri) {
      // Check if it's a playlist/album URI (context) or track URI
      if (uri.includes('playlist') || uri.includes('album')) {
        playBody.context_uri = uri;
      } else {
        playBody.uris = [uri];
      }
    }

    console.log("📤 Sending to Spotify:", playBody);

    const response = await fetch("https://api.spotify.com/v1/me/player/play", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(playBody),
    });

    if (response.status === 204) {
      console.log("✅ Play command successful");
      return res.status(204).end();
    }

    if (response.status === 404) {
      console.error("❌ No active device found");
      return res.status(404).json({ 
        error: "No active device found. Start Spotify on a device first." 
      });
    }

    if (response.status === 403) {
      const errorText = await response.text();
      console.error("❌ Forbidden:", errorText);
      return res.status(403).json({ 
        error: "Premium required or restriction violated" 
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Spotify API error:", response.status, errorText);
      
      try {
        const errorJson = JSON.parse(errorText);
        return res.status(response.status).json({ 
          error: errorJson.error?.message || "Playback failed" 
        });
      } catch (e) {
        return res.status(response.status).json({ 
          error: "Playback failed" 
        });
      }
    }

    return res.status(200).json({ success: true });
    
  } catch (err) {
    console.error("❌ Play endpoint error:", err);
    return res.status(500).json({ 
      error: err.message || "Internal server error" 
    });
  }
}