// pages/dashboard.js
import SpotifyPlayer from '../components/SpotifyPlayer';

export default function Dashboard() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Dashboard</h1>
      <p>This is the dashboard. If you were redirected here after auth, you should see the player below.</p>
      <div style={{ marginTop: 16 }}>
        <SpotifyPlayer />
      </div>
    </main>
  );
}