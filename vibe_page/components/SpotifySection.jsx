"use client";
// components/SpotifySection.jsx
// Tabs: Next | Search | Library (shows user's saved tracks + playlists)
// Uses /api/spotify/library (server-proxied, requires user auth cookie).

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

  useEffect(() => {
    if (tab === "next") fetchCurrent();
    if (tab === "library") fetchLibrary();
    if (tab === "browse") setTab("library"); // safety if older state persists
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
      const res = await fetch("/api/spotify/library");
      if (res.status === 401) {
        setError("Not authorized. Please reconnect Spotify to view your library.");
        setLibrary(null);
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      const json = await res.json();
      setLibrary(json);
    } catch (err) {
      setError(err.message || "Failed to load library");
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

  async function playUri(uri) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/spotify/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uri }),
      });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      setTimeout(fetchCurrent, 700);
    } catch (err) {
      setError(err.message || "Failed to play");
    } finally {
      setLoading(false);
    }
  }

  function renderTrackItem(track) {
    const artists = (track.artists || []).map((a) => a.name).join(", ");
    const image = track.album?.images?.[0]?.url;
    return (
      <div key={track.id || track.uri} className={styles.track}>
        {image && <img src={image} alt="" className={styles.art} />}
        <div className={styles.meta}>
          <div className={styles.title}>{track.name}</div>
          <div className={styles.subtitle}>{artists}</div>
        </div>
        <div className={styles.actions}>
          <button onClick={() => playUri(track.uri)} className={styles.playBtn}>Play</button>
        </div>
      </div>
    );
  }

  return (
    <section className={styles.container} aria-label="Spotify section">
      <div className={styles.header}>
        
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${tab === "next" ? styles.active : ""}`} onClick={() => setTab("next")}>Next</button>
          <button className={`${styles.tab} ${tab === "search" ? styles.active : ""}`} onClick={() => setTab("search")}>Search</button>
          <button className={`${styles.tab} ${tab === "library" ? styles.active : ""}`} onClick={() => setTab("library")}>Library</button>
        </div>
      </div>

      <div className={styles.body}>
        {error && <div className={styles.error}>{error}</div>}

        {tab === "next" && (
          <div>
            <div className={styles.controls}>
              <button onClick={skipNext} className={styles.controlBtn} disabled={loading}>Skip</button>
              <button onClick={fetchCurrent} className={styles.controlBtn} disabled={loading}>Refresh</button>
            </div>

            {loading && <div className={styles.note}>Loading current playback…</div>}
            {!loading && current && current.item && (
              <div className={styles.current}>
                <img src={current.item.album?.images?.[0]?.url} alt="" className={styles.artLarge} />
                <div className={styles.currentMeta}>
                  <div className={styles.title}>{current.item.name}</div>
                  <div className={styles.subtitle}>{(current.item.artists || []).map(a => a.name).join(", ")}</div>
                  <div className={styles.progressSmall}>
                    {Math.floor((current.progress_ms || 0) / 1000)}s / {Math.floor((current.item.duration_ms || 0) / 1000)}s
                  </div>
                </div>
              </div>
            )}
            {!loading && !current && <div className={styles.note}>No active playback found. Start a device or play a track.</div>}
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
              <button type="submit" className={styles.searchBtn} disabled={loading}>Search</button>
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
            {loading && <div className={styles.note}>Loading library…</div>}
            {library && (
              <>
                <div className={styles.sectionHeader}>Saved tracks</div>
                {library.savedTracks && library.savedTracks.items && library.savedTracks.items.length ? (
                  <div className={styles.results}>
                    {library.savedTracks.items.map((it) => renderTrackItem(it.track))}
                  </div>
                ) : (
                  <div className={styles.note}>No saved tracks found.</div>
                )}

                <div className={styles.sectionHeader}>Your playlists</div>
                {library.playlists && library.playlists.items && library.playlists.items.length ? (
                  <div className={styles.results}>
                    {library.playlists.items.map((pl) => (
                      <div key={pl.id} className={styles.playlist}>
                        {pl.images?.[0]?.url && <img src={pl.images[0].url} className={styles.art} alt="" />}
                        <div className={styles.meta}>
                          <div className={styles.title}>{pl.name}</div>
                          <div className={styles.subtitle}>{pl.description || `${pl.tracks?.total ?? ""} tracks`}</div>
                        </div>
                        <div className={styles.actions}>
                          <button className={styles.playBtn} onClick={() => playUri(pl.uri)}>Play</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={styles.note}>No playlists found.</div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}