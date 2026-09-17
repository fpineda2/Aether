// pages/api/spotify/seek.js
// POST /api/spotify/seek
// Seeks to a position in the currently playing track
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
    const { position_ms } = req.body;
    
    if (position_ms === undefined || position_ms === null) {
      return res.status(400).json({ error: "position_ms is required" });
    }
    
    // Ensure position is a valid number
    const positionInt = parseInt(position_ms, 10);
    if (isNaN(positionInt) || positionInt < 0) {
      return res.status(400).json({ error: "Invalid position_ms value" });
    }
    
    console.log("🎯 Seeking to position:", positionInt, "ms");

    const response = await fetch(
      `https://api.spotify.com/v1/me/player/seek?position_ms=${positionInt}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (response.status === 204) {
      console.log("✅ Seek successful");
      return res.status(204).end();
    }

    if (response.status === 403) {
      console.error("❌ Seek forbidden - Premium required or device restriction");
      return res.status(403).json({ 
        error: "Cannot seek - Premium required or device restriction" 
      });
    }

    if (response.status === 404) {
      console.error("❌ No active device");
      return res.status(404).json({ 
        error: "No active device found" 
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Spotify seek error:", response.status, errorText);
      return res.status(response.status).json({ 
        error: "Failed to seek" 
      });
    }

    return res.status(200).json({ success: true });
    
  } catch (err) {
    console.error("❌ Seek endpoint error:", err);
    return res.status(500).json({ 
      error: err.message || "Internal server error" 
    });
  }
}