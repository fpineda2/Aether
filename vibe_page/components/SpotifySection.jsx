"use client";
// components/SpotifySection.jsx
// Enhanced version with Next | Search | Library tabs
// Library now includes drill-down into playlists and better organization

import { useEffect, useState } from "react";
import styles from "./SpotifySection.module.css";

export default function SpotifySection() {
  const [tab, setTab] = useState("next"); // next | search | library
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [library, setLibrary] = useState(null);
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  // New state for enhanced library
  const [libraryView, setLibraryView] = useState("playlists"); // playlists | albums | tracks
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [playlistTracks, setPlaylistTracks] = useState([]);

  // Auto-fetch current playback on mount if starting on Next tab
  useEffect(() => {
    if (tab === "next") {
      fetchCurrent();
    }
  }, []);

  useEffect(() => {
    if (tab === "next") fetchCurrent();
    if (tab === "library") fetchLibrary();
    if (tab === "browse") setTab("library");
  }, [tab]);

  async function fetchCurrent() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/spotify/current");
      if (res.status === 204) {
        setCurrent(null);
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      const json = await res.json();
      setCurrent(json);
    } catch (err) {
      setError(err.message || "Failed to get current playback");
    } finally {
      setLoading(false);
    }
  }

  async function fetchLibrary() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/spotify/library", { cache: "no-store" });
      
      if (res.status === 401) {
        setError("Not authorized. Please reconnect Spotify to view your library.");
        setLibrary(null);
        setLoading(false);
        return;
      }
      
      if (!res.ok) {
        const text = await res.text();
        console.error("Library fetch failed:", res.status, text);
        throw new Error("Failed to load library");
      }
      
      // Check if response is actually JSON
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("Library response is not JSON:", text);
        throw new Error("Server returned invalid response. Check your API endpoint.");
      }
      
      const json = await res.json();
      
      // Debug logging
      console.log("📦 Library data received:", {
        hasSavedTracks: !!json.savedTracks,
        hasItems: !!json.savedTracks?.items,
        itemsLength: json.savedTracks?.items?.length,
        firstItem: json.savedTracks?.items?.[0],
      });
      
      setLibrary(json);
    } catch (err) {
      console.error("fetchLibrary error:", err);
      setError(err.message || "Failed to load library");
    } finally {
      setLoading(false);
    }
  }

  async function fetchPlaylistTracks(playlistId) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/spotify/playlists/${playlistId}/tracks`, { 
        cache: "no-store" 
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("Playlist tracks fetch failed:", text);
        throw new Error("Failed to load playlist tracks");
      }
      
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        console.error("Response is not JSON:", await res.text());
        throw new Error("Server returned invalid response");
      }
      
      const data = await res.json();
      setPlaylistTracks(data.items || []);
    } catch (err) {
      console.error("fetchPlaylistTracks error:", err);
      setError(err.message || "Error loading playlist tracks. The API endpoint may not be set up yet.");
    } finally {
      setLoading(false);
    }
  }

  async function skipNext() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/spotify/next", { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      setTimeout(fetchCurrent, 700);
    } catch (err) {
      setError(err.message || "Failed to skip");
    } finally {
      setLoading(false);
    }
  }

  async function doSearch(e) {
    e && e.preventDefault();
    if (!query) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      const json = await res.json();
      setSearchResults(json);
    } catch (err) {
      setError(err.message || "Search failed");
    } finally {
      setLoading(false);
    }
  }

  async function playUri(uri, contextUri = null) {
    setLoading(true);
    setError("");
    try {
      const body = { uri };
      if (contextUri) body.context_uri = contextUri;
      
      const res = await fetch("/api/spotify/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      
      // Auto-refresh current playback after playing
      setTimeout(() => {
        if (tab === "next") fetchCurrent();
      }, 1000);
    } catch (err) {
      setError(err.message || "Failed to play");
    } finally {
      setLoading(false);
    }
  }

  function handlePlaylistClick(playlist) {
    // Check if the endpoint exists before trying to fetch
    setSelectedPlaylist(playlist);
    fetchPlaylistTracks(playlist.id);
  }

  function handleBackToLibrary() {
    setSelectedPlaylist(null);
    setPlaylistTracks([]);
  }

  function formatDuration(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  function formatTime(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  function renderTrackItem(track, index = null, contextUri = null) {
    const artists = (track.artists || []).map((a) => a.name).join(", ");
    const image = track.album?.images?.[0]?.url;
    return (
      <div key={track.id || track.uri} className={styles.track}>
        {index !== null && <div className={styles.trackNumber}>{index + 1}</div>}
        {image && <img src={image} alt="" className={styles.art} />}
        <div className={styles.meta}>
          <div className={styles.title}>{track.name}</div>
          <div className={styles.subtitle}>{artists}</div>
        </div>
        {track.duration_ms && (
          <div className={styles.duration}>{formatDuration(track.duration_ms)}</div>
        )}
        <div className={styles.actions}>
          <button 
            onClick={() => playUri(track.uri, contextUri)} 
            className={styles.playBtn}
          >
            ▶
          </button>
        </div>
      </div>
    );
  }

  function renderPlaylistCard(playlist) {
    return (
      <div 
        key={playlist.id} 
        className={styles.playlistCard}
        onClick={() => handlePlaylistClick(playlist)}
      >
        {playlist.images?.[0]?.url && (
          <img src={playlist.images[0].url} className={styles.cardImage} alt="" />
        )}
        {!playlist.images?.[0]?.url && (
          <div className={styles.cardImagePlaceholder}>🎵</div>
        )}
        <div className={styles.cardContent}>
          <div className={styles.cardTitle}>{playlist.name}</div>
          <div className={styles.cardSubtitle}>
            {playlist.tracks?.total || 0} tracks
          </div>
        </div>
        <button
          className={styles.cardPlayBtn}
          onClick={(e) => {
            e.stopPropagation();
            playUri(playlist.uri);
          }}
        >
          ▶
        </button>
      </div>
    );
  }

  function renderAlbumCard(albumItem) {
    const album = albumItem.album;
    return (
      <div key={album.id} className={styles.playlistCard}>
        {album.images?.[0]?.url && (
          <img src={album.images[0].url} className={styles.cardImage} alt="" />
        )}
        <div className={styles.cardContent}>
          <div className={styles.cardTitle}>{album.name}</div>
          <div className={styles.cardSubtitle}>
            {album.artists?.map(a => a.name).join(", ")}
          </div>
        </div>
        <button
          className={styles.cardPlayBtn}
          onClick={() => playUri(album.uri)}
        >
          ▶
        </button>
      </div>
    );
  }

  return (
    <section className={styles.container} aria-label="Spotify section">
      <div className={styles.header}>
        <h3>Spotify</h3>
        <div className={styles.tabs}>
          <button 
            className={`${styles.tab} ${tab === "next" ? styles.active : ""}`} 
            onClick={() => setTab("next")}
          >
            Next
          </button>
          <button 
            className={`${styles.tab} ${tab === "search" ? styles.active : ""}`} 
            onClick={() => setTab("search")}
          >
            Search
          </button>
          <button 
            className={`${styles.tab} ${tab === "library" ? styles.active : ""}`} 
            onClick={() => setTab("library")}
          >
            Library
          </button>
        </div>
      </div>

      <div className={styles.body}>
        {error && <div className={styles.error}>{error}</div>}

        {tab === "next" && (
          <div>
            <div className={styles.controls}>
              <button onClick={skipNext} className={styles.controlBtn} disabled={loading}>
                Skip to next
              </button>
              <button onClick={fetchCurrent} className={styles.controlBtn} disabled={loading}>
                Refresh
              </button>
            </div>

            {loading && <div className={styles.note}>Loading current playback…</div>}
            {!loading && current && current.item && (
              <div className={styles.nowPlaying}>
                <div className={styles.recordContainer}>
                  <div className={`${styles.record} ${current.is_playing ? styles.spinning : ''}`}>
                    {current.item.album?.images?.[0]?.url && (
                      <img 
                        src={current.item.album.images[0].url} 
                        alt={current.item.name}
                        className={styles.recordImage} 
                      />
                    )}
                    <div className={styles.recordCenter}></div>
                  </div>
                </div>
                <div className={styles.trackInfo}>
                  <div className={styles.trackName}>{current.item.name}</div>
                  <div className={styles.artistName}>
                    {(current.item.artists || []).map(a => a.name).join(", ")}
                  </div>
                  <div className={styles.progressBar}>
                    <div 
                      className={styles.progressFill} 
                      style={{ 
                        width: `${(current.progress_ms / current.item.duration_ms) * 100}%` 
                      }}
                    ></div>
                  </div>
                  <div className={styles.timeDisplay}>
                    {formatTime(current.progress_ms)} / {formatTime(current.item.duration_ms)}
                  </div>
                </div>
              </div>
            )}
            {!loading && !current && (
              <div className={styles.note}>
                No active playback found. Start a device or play a track.
              </div>
            )}
          </div>
        )}

        {tab === "search" && (
          <div>
            <form onSubmit={doSearch} className={styles.searchForm}>
              <input
                aria-label="Search tracks, artists, playlists"
                placeholder="Search tracks, artists, playlists..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className={styles.searchInput}
              />
              <button type="submit" className={styles.searchBtn} disabled={loading}>
                Search
              </button>
            </form>

            {loading && <div className={styles.note}>Searching…</div>}
            {searchResults && searchResults.tracks && searchResults.tracks.items.length === 0 && (
              <div className={styles.note}>No results</div>
            )}
            {searchResults && searchResults.tracks && (
              <div className={styles.results}>
                {searchResults.tracks.items.map(t => renderTrackItem(t))}
              </div>
            )}
          </div>
        )}

        {tab === "library" && (
          <div>
            {/* Show playlist detail view */}
            {selectedPlaylist ? (
              <div className={styles.playlistDetail}>
                <button className={styles.backBtn} onClick={handleBackToLibrary}>
                  ← Back to Library
                </button>
                
                <div className={styles.playlistHeader}>
                  {selectedPlaylist.images?.[0]?.url && (
                    <img 
                      src={selectedPlaylist.images[0].url} 
                      alt={selectedPlaylist.name}
                      className={styles.playlistDetailImage}
                    />
                  )}
                  <div className={styles.playlistHeaderInfo}>
                    <h2 className={styles.playlistDetailTitle}>{selectedPlaylist.name}</h2>
                    <p className={styles.playlistDetailSubtitle}>
                      {selectedPlaylist.description || `${selectedPlaylist.tracks?.total || 0} tracks`}
                    </p>
                    <button
                      className={styles.playAllBtn}
                      onClick={() => playUri(selectedPlaylist.uri)}
                    >
                      ▶ Play All
                    </button>
                  </div>
                </div>

                {loading && <div className={styles.note}>Loading tracks...</div>}
                
                <div className={styles.trackList}>
                  {playlistTracks.map((item, idx) => {
                    const track = item.track;
                    if (!track) return null;
                    return renderTrackItem(track, idx, selectedPlaylist.uri);
                  })}
                </div>
              </div>
            ) : (
              /* Show library overview with sub-tabs */
              <>
                <div className={styles.libraryTabs}>
                  <button
                    className={`${styles.libraryTab} ${libraryView === "playlists" ? styles.libraryTabActive : ""}`}
                    onClick={() => setLibraryView("playlists")}
                  >
                    Playlists
                  </button>
                  <button
                    className={`${styles.libraryTab} ${libraryView === "tracks" ? styles.libraryTabActive : ""}`}
                    onClick={() => setLibraryView("tracks")}
                  >
                    Liked Songs
                  </button>
                </div>

                {loading && <div className={styles.note}>Loading library…</div>}
                
                {library && libraryView === "playlists" && (
                  <div>
                    {library.playlists && library.playlists.items && library.playlists.items.length ? (
                      <div className={styles.cardGrid}>
                        {library.playlists.items.map(pl => renderPlaylistCard(pl))}
                      </div>
                    ) : (
                      <div className={styles.note}>No playlists found.</div>
                    )}
                  </div>
                )}

                {library && libraryView === "tracks" && (
                  <div>
                    {library.savedTracks && library.savedTracks.items && library.savedTracks.items.length ? (
                      <div className={styles.results}>
                        {library.savedTracks.items.map((it, idx) => {
                          // Handle different possible structures
                          const track = it.track || it;
                          return track ? renderTrackItem(track, idx) : null;
                        })}
                      </div>
                    ) : (
                      <div className={styles.note}>
                        No saved tracks found.
                        {library.savedTracks && (
                          <div style={{ fontSize: '12px', marginTop: '8px', opacity: 0.7 }}>
                            Debug: {JSON.stringify(Object.keys(library.savedTracks || {}))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}