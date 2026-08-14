import SpaceChains from "../components/SpaceChains"
import BootWrapper from '../components/BootWrapper';
import SpotifySection from "../components/SpotifySection";
import InteractiveMode from "../components/InteractiveMode";
import SpotifyPlayer from "../components/SpotifyPlayer"
import styles from "../styles/Dashboard.module.css";

export default function Page() {
  return (


    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <header className="text-center mb-8">
      <h1 className="inline-block font-[var(--font-display)] text-5xl tracking-[0.01em] leading-tight bg-[linear-gradient(90deg,#8b5cf6_0%,#67e8f9_48%,#ff2ea6_100%)] bg-clip-text text-transparent drop-shadow-[0_0_18px_rgba(139,92,246,0.45)]">
      Aether
      </h1>

        <h2 className="font-[var(--font-body)] text-gray-200/90 mt-2">
          Where sound becomes atmosphere
        </h2>

          <h3 className="font-[var(--font-body)] text-gray-200/90 mt-2">
          An interactive audiovisual dashboard that transforms music into responsive costmic motion, and color.
          </h3>

      </header>


      {/* Dashboard Grid */}
      <main className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Feed Section — sits full width across the top */}
        <section id="feed" className="bg-gray-900/70 p-6 rounded-2xl shadow-lg shadow-purple-500/30 md:col-span-2">
          <h2 className="text-xl font-bold mb-4">About</h2>
                  <p className="font-[var(--font-body)] text-gray-200/90 mt-2">
          &ldquo;The connection between music and visuals is a deeply intertwined relationship that spans neurological, artistic, and historical dimensions. Whether through sensory-blending phenomena like synesthesia, historical theories of color-to-sound, or multimedia collaborations, sound and vision constantly inform and elevate each other&rdquo; -
Online College of Art and Design

        </p>
        </section>

        {/* Playlist Section */}
        <section id="playlist" className={styles.playlistSection}>
          <h2 className={styles.sectionTitle}>Spotify</h2> 

          {/* SpotifySection is a client component with tabs: Next | Search | Browse */}

          {/* Optional player below */}
          <div style={{ marginTop: 18 }}>
            <SpotifyPlayer />
          </div>
        </section>

        {/* Sidebar / Visualizer — now sits next to Playlist instead of above it */}
        <aside id="sidebar" className="bg-transparent p-6 rounded-2xl shadow-lg shadow-blue-500/30
             ornate-frame corner-flourish panel-gap">

          <div className="mt-6 pt-6 border-t border-white/10">
            <InteractiveMode />
          </div>
        </aside>
      </main>

    </div>
  )
}