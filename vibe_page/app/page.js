import SpaceChains from "../components/SpaceChains"
import BootWrapper from '../components/BootWrapper';
import SpotifySection from "../components/SpotifySection";
import SpotifyPlayer from "../components/SpotifyPlayer"
import styles from "../styles/Dashboard.module.css";

export default function Page() {
  return (

    
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <header className="text-center mb-8">
      <h1 className="font-[var(--font-display)] text-5xl tracking-[0.01em] leading-tight drop-shadow-[0_1px_12px_rgba(255,255,255,0.15)]">
      🚀 Dashboard
      </h1>

        <p className="font-[var(--font-body)] text-gray-200/90 mt-2">
          Welcome back! Here’s your activity overview.
        </p>
        <nav className="flex justify-center gap-8 mt-4 text-blue-400 underline">
          <a href="/">Home</a>
          <a href="/cool">Cool Stuff</a>
          <a href="/made">Things I&apos;ve Made</a>
          <a href="/deep">Deeper Look</a>
        </nav>
        {/*<button className="mt-5 px-5 py-2 bg-red-600 rounded-xl shadow-lg shadow-red-400/40 hover:bg-red-500 transition">
          Sign Out
        </button>*/}
      </header>

      {/* Book-edge tabs (right side) */}
      <nav className="fixed right-4 top-1/2 -translate-y-1/2 z-20 space-y-2">
        {["Library", "Studio", "Notes"].map((t) => (
          <a
            key={t}
            href="#"
            className="block px-3 py-2 rounded-l-lg bg-gray-900/80 border border-white/10
                       font-[var(--font-heading)] italic text-sm
                       hover:translate-x-[-2px] transition"
          >
            {t}
          </a>
        ))}
      </nav>

      {/* Dashboard Grid */}
      <main className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Sidebar */}
        <aside id="sidebar" className="bg-gray-900/80 p-6 rounded-2xl shadow-lg shadow-blue-500/30
             ornate-frame corner-flourish panel-gap">
          <h2 className="font-[var(--font-heading)] italic text-2xl mb-4">Menu</h2>
          <ul className="list-disc ml-6 text-blue-400 space-y-2">
            <li><a href="#">Account</a></li>
            <li><a href="#">Privacy</a></li>
          </ul>
        </aside>

        {/* Feed Section */}
        <section id="feed" className="bg-gray-900/70 p-6 rounded-2xl shadow-lg shadow-purple-500/30 backdrop-blur-md md:col-span-2">
          <h2 className="text-xl font-bold mb-4">Feed / About Me / Art</h2>
          <ul className="list-disc ml-6 text-gray-200 space-y-2">
            <li>Post 1</li>
            <li>Post 2</li>
            <li>Post 3</li>
          </ul>
        </section>


        {/* Playlist Section */}
{/* Playlist Section */}
        <section id="playlist" className={styles.playlistSection}>
          <h2 className={styles.sectionTitle}>Playlists & Spotify</h2>

          {/* SpotifySection is a client component with tabs: Next | Search | Browse */}
          <SpotifySection />

          {/* Optional player below */}
          <div style={{ marginTop: 18 }}>
            <SpotifyPlayer />
          </div>
        </section>
  

        {/* Links Section */}
        <section id="links" className="bg-gray-900/80 p-6 rounded-2xl shadow-lg shadow-pink-500/30
             ornate-frame panel-gap md:col-span-2">
          <h2 className="font-[var(--font-heading)] italic text-xl mb-3 ink-underline">Links / Pictures / GIFs / Stickers</h2>
          <div className="grid grid-cols-2 gap-4 text-gray-200">
            <div className="p-4 bg-gray-800/70 rounded-lg shadow-md">Card 1</div>
            <div className="p-4 bg-gray-800/70 rounded-lg shadow-md">Card 2</div>
            <div className="p-4 bg-gray-800/70 rounded-lg shadow-md">Card 3</div>
            <div className="p-4 bg-gray-800/70 rounded-lg shadow-md">Card 4</div>
          </div>
        </section>
      </main>

       {/* Chain overlay goes at page root so it can reach everything */}

  
    </div>
  )
}
