export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { playlistId } = req.query;
    
    console.log("🎵 Playlist tracks request - ID:", playlistId);
    
    if (!playlistId) {
      console.error("❌ No playlist ID in query params");
      return res.status(400).json({ error: 'Playlist ID is required' });
    }
    
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3000}`;
    const tokenRes = await fetch(`${baseUrl}/api/auth/token`, {
      headers: {
        cookie: req.headers.cookie || '',
      },
    });
    
    if (!tokenRes.ok) {
      console.error("❌ Token fetch failed");
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token || tokenData.token;
    
    if (!accessToken) {
      console.error("❌ No access token in response");
      return res.status(401).json({ error: 'No access token' });
    }
    
    console.log("✅ Fetching tracks for playlist:", playlistId);
    
    const response = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Spotify API error:', response.status, errorText);
      return res.status(response.status).json({ error: 'Failed to fetch playlist tracks' });
    }
    
    const data = await response.json();
    console.log("✅ Successfully fetched", data.items?.length || 0, "tracks");
    
    return res.status(200).json(data);
    
  } catch (error) {
    console.error('❌ Playlist tracks API error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
