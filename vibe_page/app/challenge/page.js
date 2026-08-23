import Link from "next/link";
import styles from "../../styles/Challenge.module.css";

const SUBMIT_EMAIL = "aether.submissions@gmail.com";

export const metadata = {
  title: "The Aether Challenge | Score a piece for the installation",
  description:
    "A listening brief for composing a track that makes Aether's live audio-reactive visuals come alive — submit yours to be added to the visualizer.",
};

export default function ChallengePage() {
  const mailtoHref =
    `mailto:${SUBMIT_EMAIL}` +
    `?subject=${encodeURIComponent("Aether track submission")}` +
    `&body=${encodeURIComponent(
      "Track title:\nHow you'd like to be credited:\n\n(Attach the audio file before sending.)"
    )}`;

  return (
    <div className={styles.page}>
      <Link href="/" className={styles.backLink}>← Back to Aether</Link>

      <p className={styles.eyebrow}>An open challenge</p>
      <h1 className={styles.title}>Score Aether</h1>
      <p className={styles.dek}>
        A listening brief for anyone who wants to compose the next piece for
        this installation — and see it live.
      </p>

      <div className={styles.intro}>
        <p>
          Aether isn&rsquo;t playing a video next to your music. Every frame,
          it&rsquo;s reading your track directly out of the browser&rsquo;s
          audio graph — splitting it into left and right, breaking it into
          frequency bands, and translating what it hears into color, motion,
          and light in real time. Nothing is pre-rendered or synced by hand.
        </p>
        <p>
          That means the visuals are only as interesting as what&rsquo;s
          actually in the mix. A track written{" "}
          <strong>with this system in mind</strong> — real bass hits, a
          spread-out frequency range, some genuine stereo width, a real
          dynamic arc — will make the whole piece feel like it&rsquo;s
          breathing along with the music. A flat, centered, one-register mix
          will still play, but a lot of what&rsquo;s described below will
          just sit quiet.
        </p>
        <p>This is the map of what&rsquo;s listening, and where.</p>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionNum}><em>I.</em></span>
          <h2 className={styles.sectionTitle}>The frequency map</h2>
        </div>
        <p className={styles.lede}>
          Four independent bands, each with its own voice. This is the
          closest thing to a mixing reference — where energy sits in the
          spectrum decides which part of the piece lights up.
        </p>

        <div className={styles.freqbar} />
        <div className={styles.freqbarLabels}>
          <span>sub-bass</span><span>low-mid</span><span>high-mid</span><span>treble / air</span>
        </div>

        <div className={styles.bandGrid}>
          <div className={styles.bandRow}>
            <span className={styles.bandSwatch} style={{ color: "hsl(0,85%,60%)", background: "hsl(0,85%,60%)" }} />
            <div>
              <div className={styles.bandName}>Sub-bass / bass</div>
              <div className={styles.bandRange}>~40&ndash;1,000 Hz &middot; kick, sub, bassline</div>
              <div className={styles.bandRole}>
                Drives beat detection itself, the center of the web&rsquo;s
                outward &ldquo;breathing&rdquo; pulse, and the innermost
                ambient glow.
              </div>
            </div>
            <div className={styles.bandEnv}>
              <svg width="84" height="32" viewBox="0 0 88 34">
                <path d="M2 30 C 10 6, 18 6, 30 6 C 55 6, 60 30, 86 30" fill="none" stroke="hsl(0,85%,62%)" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              <span className={styles.bandEnvLabel}>slow swell &middot; long tail</span>
            </div>
          </div>

          <div className={styles.bandRow}>
            <span className={styles.bandSwatch} style={{ color: "hsl(90,55%,55%)", background: "hsl(90,55%,55%)" }} />
            <div>
              <div className={styles.bandName}>Low-mid</div>
              <div className={styles.bandRange}>~1,000&ndash;3,400 Hz &middot; low vocals, guitar/piano body, warmth</div>
              <div className={styles.bandRole}>
                Its own ambient glow, eased a touch faster than the bass —
                reads as a second, independent voice underneath everything
                else.
              </div>
            </div>
            <div className={styles.bandEnv}>
              <svg width="84" height="32" viewBox="0 0 88 34">
                <path d="M2 30 C 8 10, 14 8, 24 8 C 44 8, 50 30, 86 30" fill="none" stroke="hsl(90,55%,55%)" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              <span className={styles.bandEnvLabel}>quicker swell &middot; shorter tail</span>
            </div>
          </div>

          <div className={styles.bandRow}>
            <span className={styles.bandSwatch} style={{ color: "hsl(190,70%,60%)", background: "hsl(190,70%,60%)" }} />
            <div>
              <div className={styles.bandName}>High-mid</div>
              <div className={styles.bandRange}>~3,400&ndash;6,900 Hz &middot; presence, upper vocals, snare crack</div>
              <div className={styles.bandRole}>
                Also colors every individual node on the web — this is the
                range most of the spectrum-bar detail comes from.
              </div>
            </div>
            <div className={styles.bandEnv}>
              <svg width="84" height="32" viewBox="0 0 88 34">
                <path d="M2 28 C 6 12, 10 10, 18 10 C 34 10, 42 28, 86 28" fill="none" stroke="hsl(190,70%,60%)" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              <span className={styles.bandEnvLabel}>fast attack &middot; quick drop</span>
            </div>
          </div>

          <div className={styles.bandRow}>
            <span className={styles.bandSwatch} style={{ color: "hsl(280,80%,70%)", background: "hsl(280,80%,70%)" }} />
            <div>
              <div className={styles.bandName}>Treble / air</div>
              <div className={styles.bandRange}>~6,900&ndash;11,000 Hz &middot; hi-hats, cymbals, sparkle</div>
              <div className={styles.bandRole}>
                Flicks in almost instantly and drops out just as fast — the
                outermost glow, and the sharpest, most percussive-feeling
                response in the whole piece.
              </div>
            </div>
            <div className={styles.bandEnv}>
              <svg width="84" height="32" viewBox="0 0 88 34">
                <path d="M2 26 C 4 14, 6 12, 12 12 C 22 12, 32 26, 86 26" fill="none" stroke="hsl(280,80%,70%)" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              <span className={styles.bandEnvLabel}>instant flick &middot; instant drop</span>
            </div>
          </div>
        </div>

        <div className={styles.callout}>
          <strong>For the piece:</strong> if the arrangement only ever
          occupies one or two of these zones, the other glows just sit
          still. Spreading real, distinct energy across all four — a
          bassline, some mid-range harmonic content, present upper-mids, and
          something sparkly on top — is what makes the whole thing light up
          at once instead of one corner of it.
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionNum}><em>II.</em></span>
          <h2 className={styles.sectionTitle}>Beat &amp; pulse</h2>
        </div>
        <p className={styles.lede}>
          The web doesn&rsquo;t just track loudness — it&rsquo;s listening
          for actual hits.
        </p>
        <div className={styles.prose}>
          <p>
            A &ldquo;beat&rdquo; is registered when the bass suddenly jumps
            well above what it&rsquo;s been averaging over roughly the last
            three-quarters of a second. In other words: it&rsquo;s watching
            for a real <em>transient</em> — a kick, a pluck, a hit — not just
            sustained low end sitting there. A pure, unchanging bass drone
            won&rsquo;t register as a beat at all, no matter how loud it is.
          </p>
          <p>
            There&rsquo;s effectively no upper tempo limit — even a fast,
            dense rhythm registers every hit cleanly. The one soft ceiling is
            on the big full-piece pulse (the whole web brightening
            together): it&rsquo;s capped at a few times per second for
            comfort, so an extremely rapid-fire section won&rsquo;t
            out-flash a moderately busy one. Below that ceiling, every
            additional hit still moves the web — it&rsquo;s just the single
            largest pulse that&rsquo;s rate-limited, not the piece&rsquo;s
            overall reactivity.
          </p>
          <p>
            Each beat also sends a single ripple outward from the center of
            the web, like a spider feeling a disturbance at the middle of
            its own web — strongest at the center, fading out toward the
            edges. Clear, punchy transients read as a visible ripple;
            smooth, un-accented pads mostly just sit in the ambient glow
            instead.
          </p>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionNum}><em>III.</em></span>
          <h2 className={styles.sectionTitle}>Color &amp; the mood arc</h2>
        </div>
        <p className={styles.lede}>
          Two separate color systems are running at once — one about{" "}
          <em>where</em> the sound sits, one about <em>how much</em> is
          happening.
        </p>

        <div className={styles.twohue}>
          <div className={styles.hueCard}>
            <h3>The web&rsquo;s own color</h3>
            <div className={styles.freqbar} style={{ marginTop: 4, marginBottom: 8 }} />
            <div className={styles.freqbarLabels} style={{ marginBottom: 14 }}>
              <span>bass</span><span>treble</span>
            </div>
            <p>
              Set by where the music&rsquo;s energy is currently centered
              across the spectrum. Bass-heavy passages drift the entire web
              toward red; bright, treble-forward ones drift it toward
              violet. It eases slowly, so it reads as the web&rsquo;s color
              genuinely moving through a piece — not flickering per note.
            </p>
          </div>
          <div className={styles.hueCard}>
            <h3>The mood of the pulse</h3>
            <div className={styles.moodbar} style={{ marginTop: 4 }} />
            <div className={styles.moodbarLabels}>
              <span>calm, quiet</span><span>loud, bass-forward</span>
            </div>
            <p>
              Tracks how loud and impactful the beats have been lately —
              quiet, sparse sections settle toward a calm green; loud,
              bass-heavy stretches push it toward a warm orange. A track with
              a real dynamic arc — hushed intro building into a huge, loud
              climax — will visibly shift color along the way, not just get
              louder.
            </p>
          </div>
        </div>

        <div className={styles.callout}>
          <strong>For the piece:</strong> this is the single biggest lever
          for the &ldquo;art installation&rdquo; feeling. A deliberate
          structural arc — sparse and ambient, building into something
          dense, bass-forward, and loud — gets mirrored almost one-to-one by
          the color the whole piece is bathed in.
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionNum}><em>IV.</em></span>
          <h2 className={styles.sectionTitle}>Stereo field</h2>
        </div>
        <p className={styles.lede}>
          Each of the four glows drifts left or right on its own, following
          only its own band&rsquo;s panning.
        </p>
        <div className={styles.prose}>
          <p>
            This is the least obvious mechanic and probably the most
            rewarding to write for. It&rsquo;s not a single overall stereo
            effect —{" "}
            <strong>
              each of the four frequency bands independently checks its own
              left/right balance
            </strong>{" "}
            and gently drifts its glow toward whichever side it&rsquo;s
            actually mixed to. Pan the hi-hats hard right while the bass sits
            dead-center, and the treble glow visibly drifts right while the
            bass glow stays put in the middle — four separate points of
            motion instead of one.
          </p>
          <p>
            A fully centered, essentially mono mix won&rsquo;t show any of
            this — everything just sits in the middle. It only appears when
            the mix genuinely uses stereo width, and per-instrument panning
            is the fastest way to unlock it.
          </p>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionNum}><em>V.</em></span>
          <h2 className={styles.sectionTitle}>Writing for it</h2>
        </div>
        <p className={styles.lede}>Everything above, as a working checklist.</p>

        <ul className={styles.checklist}>
          <li>
            <span className={styles.checkMark}>✓</span>
            <div>
              <strong>Give the bass real hits, not just presence</strong>
              <span>A felt kick or pluck, not a constant drone — that&rsquo;s what the beat detector and the center-out ripple are both listening for.</span>
            </div>
          </li>
          <li>
            <span className={styles.checkMark}>✓</span>
            <div>
              <strong>Spread the arrangement across the full range</strong>
              <span>Distinct bass, mid, upper-mid, and sparkle/treble elements — so all four glows have something to react to, not just one.</span>
            </div>
          </li>
          <li>
            <span className={styles.checkMark}>✓</span>
            <div>
              <strong>Use real stereo width, panned per instrument</strong>
              <span>A centered mono mix leaves the whole surround-drift effect completely unused.</span>
            </div>
          </li>
          <li>
            <span className={styles.checkMark}>✓</span>
            <div>
              <strong>Shape a genuine dynamic arc</strong>
              <span>Quiet and sparse building into loud and bass-forward is what actually moves the piece&rsquo;s color, not just its volume.</span>
            </div>
          </li>
          <li>
            <span className={styles.checkMark}>✓</span>
            <div>
              <strong>Don&rsquo;t chase extreme density for its own sake</strong>
              <span>Tempo is effectively unlimited, but the biggest full-piece pulse is capped for comfort — past a certain point, more hits per second stops buying more visual payoff. Spectral variety pays off more than raw speed.</span>
            </div>
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionNum}><em>VI.</em></span>
          <h2 className={styles.sectionTitle}>Submit your piece</h2>
        </div>
        <p className={styles.lede}>
          Write something for this, and it can live in the actual
          installation — not just play under it.
        </p>

        <div className={styles.submitCard}>
          <p>
            If you write a track with this brief in mind, send it over. A
            handful of submissions get added to Aether&rsquo;s bundled track
            list — the same visualizer picker every visitor sees — with
            credit in the title, exactly like the tracks already featured
            there.
          </p>
          <ol className={styles.submitSteps}>
            <li>Export a stereo file (MP3, WAV, M4A, FLAC, or similar all work).</li>
            <li>Attach it to an email with the track title and how you&rsquo;d like to be credited.</li>
            <li>Send it — if it&rsquo;s a fit, you&rsquo;ll hear back once it&rsquo;s live.</li>
          </ol>
          <a href={mailtoHref} className={styles.emailButton}>
            ✉ Email your submission
          </a>
        </div>
      </section>

      <div className={styles.practicals}>
        <div>
          <dt>Formats</dt>
          <dd>MP3, M4A, WAV, OGG, FLAC, AAC, or WebM — any of these play and analyze cleanly.</dd>
        </div>
        <div>
          <dt>Channels</dt>
          <dd>Stereo, please — the panning-driven drift needs two real channels to read from.</dd>
        </div>
        <div>
          <dt>Length</dt>
          <dd>No fixed requirement — it loops, so anything from a short loop to a full piece works.</dd>
        </div>
      </div>

      <p className={styles.credit}>Aether &middot; an audio-reactive installation</p>
    </div>
  );
}
