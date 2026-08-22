"use client"

import "./globals.css"
import { useState, useEffect, useRef } from "react"
import dynamic from "next/dynamic"
import BootWrapper from "../components/BootWrapper";

// Cursor effects and the audio-reactive canvas renderer are decorative, not
// needed for first paint — code-split them out of the main bundle instead of
// bundling them with the critical layout/boot path. ssr:false since both
// touch window/document immediately on mount.
const CursorWrapper = dynamic(() => import("../components/CursorWrapper"), { ssr: false });
const AudioReactiveStarfield = dynamic(() => import("../components/AudioReactiveStarfield"), { ssr: false });

// Rough device-capability heuristic for scaling particle-heavy background
// effects. No single signal is reliable on its own (deviceMemory is
// Chromium-only, hardwareConcurrency can be spoofed/capped), so this treats
// "low power" as: explicitly low core/memory count, OR a small viewport
// (mobile-shaped devices skew toward less powerful GPUs too).
function getPerfScale() {
  if (typeof navigator === "undefined") return 1;
  const cores = navigator.hardwareConcurrency || 8;
  const mem = navigator.deviceMemory; // undefined on non-Chromium
  const smallViewport = typeof window !== "undefined" && window.innerWidth < 768;
  const lowPower = cores <= 4 || (mem !== undefined && mem <= 4) || smallViewport;
  return lowPower ? 0.5 : 1;
}

export default function RootLayout({ children }) {
  // The intro overlay is fully opaque, so none of the background canvases,
  // cursor effects, or the audio-reactive controller do anything useful
  // until the user has actually entered — they'd just burn main-thread time
  // under something nobody can see. Deferred until BootWrapper says the
  // intro has resolved (immediately, if already seen before).
  const [entered, setEntered] = useState(false)
  const starsRef = useRef([]) // top level — effect fills it, JSX reads it, no re-renders
  const webState = useRef([])


  useEffect(() => {
    if (!entered) return

    // --- Clean up any old canvases if hot reloading ---
    document.getElementById("starfield-bg")?.remove()
    document.getElementById("spiderweb-bg")?.remove()

    // --- STARFIELD (very subtle) ---
    const starCanvas = document.createElement("canvas")
    starCanvas.id = "starfield-bg"
    Object.assign(starCanvas.style, {
      position: "fixed",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      zIndex: "-3",
      pointerEvents: "none",
    })
    document.body.appendChild(starCanvas)

    const perfScale = getPerfScale() // scale particle density down on lower-powered devices

    const sc = starCanvas.getContext("2d")
    const resizeStar = () => {
      starCanvas.width = window.innerWidth
      starCanvas.height = window.innerHeight

    }

    const count = Math.floor((starCanvas.width * starCanvas.height) / 15000 * perfScale) // density scales with screen
    starsRef.current = Array.from({ length: count }, () => ({
        x: Math.random() * starCanvas.width,
        y: Math.random() * starCanvas.height,
        r: Math.random() * 0.9 + 0.4, // 0.4–1.3 px
        a: Math.random() * Math.PI * 2, // phase
        s: Math.random() * 0.015 + 0.007, // twinkle speed
      }))

      // Publish star data so AudioReactiveStarfield's pulse renderer can draw it
    window.__starsData = starsRef.current

    let starRaf = null
    function drawStars() {
      // Only draw if AudioReactiveStarfield isn't controlling it
      if (!window.__audioReactiveActive) {
        sc.clearRect(0, 0, starCanvas.width, starCanvas.height)
        for (const st of starsRef.current) {
          st.a += st.s
          const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(st.a))
          sc.beginPath()
          sc.arc(st.x, st.y, st.r, 0, Math.PI * 2)
          sc.fillStyle = `rgba(255,255,255,${twinkle * 0.5})`
          sc.fill()
        }
      }
      // Stop scheduling frames while the tab is hidden — resumed by the
      // visibilitychange listener below instead of burning cycles offscreen.
      starRaf = document.hidden ? null : requestAnimationFrame(drawStars)
    }

    resizeStar()
    drawStars()
    window.addEventListener("resize", resizeStar)

    // --- SPIDERWEB (your original, unchanged except zIndex) ---
    const webCanvas = document.createElement("canvas")
    webCanvas.id = "spiderweb-bg"
    Object.assign(webCanvas.style, {
      position: "fixed",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      zIndex: "-2",
      pointerEvents: "none",
    })
    document.body.appendChild(webCanvas)

    const ctx = webCanvas.getContext("2d")
    let width, height, particles
    const mouse = { x: null, y: null }
    let hue = 200 // keep your cosmic hue rotation

    function resizeWeb() {
      width = webCanvas.width = window.innerWidth
      height = webCanvas.height = window.innerHeight
      particles = Array.from({ length: Math.round(145 * perfScale) }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
      }))
    }

    let webRaf = null
    function drawWeb() {
      // Only draw if AudioReactiveStarfield isn't controlling it
      if (!window.__audioReactiveActive) {
        ctx.clearRect(0, 0, width, height)
        ctx.lineWidth = 0.5

        particles.forEach(p => {
          p.x += p.vx
          p.y += p.vy
          if (p.x < 0 || p.x > width) p.vx *= -1
          if (p.y < 0 || p.y > height) p.vy *= -1

          // points
          ctx.beginPath()
          ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2)
          ctx.fillStyle = "rgba(255,255,255,0.9)"
          ctx.fill()

          // mouse attraction lines (colorized)
          if (mouse.x != null && mouse.y != null) {
            const dx = p.x - mouse.x
            const dy = p.y - mouse.y
            // Cheap bounding check before the sqrt — skips the expensive
            // call outright for the vast majority of pairs that are
            // obviously too far apart to ever pass the distance test.
            if (Math.abs(dx) <= 120 && Math.abs(dy) <= 120) {
              const dist = Math.sqrt(dx * dx + dy * dy)
              if (dist < 120) {
                ctx.beginPath()
                ctx.moveTo(p.x, p.y)
                ctx.lineTo(mouse.x, mouse.y)
                ctx.strokeStyle = `hsla(${hue}, 100%, 70%, ${1 - dist / 120})`

                ctx.stroke()
              }
            }
          }
        })

        // particle-to-particle lines (colorized). This is the O(n^2) hot
        // spot — a cheap bounding check before the sqrt skips it for most
        // of the n*(n-1)/2 pairs, which are usually too far apart to matter.
        for (let i = 0; i < particles.length; i++) {
          for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x
            const dy = particles[i].y - particles[j].y
            if (Math.abs(dx) > 150 || Math.abs(dy) > 150) continue
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist < 150) {
              ctx.beginPath()
              ctx.moveTo(particles[i].x, particles[i].y)
              ctx.lineTo(particles[j].x, particles[j].y)
              ctx.strokeStyle = `hsla(${hue}, 100%, 70%, ${1 - dist / 150})`
              ctx.stroke()
            }
          }
        }

        hue = (hue + 0.3) % 360
      } else {
        // Even in audio-reactive mode, update hue for color rotation
        hue = (hue + 0.3) % 360
      }
      
      // Always update webData for AudioReactiveStarfield
      webState.current = { width, height, particles, mouse, hue } //Produced by layout and child reads it (DOWN)
      window.__webData = webState.current

      // Same idea as drawStars: don't keep scheduling frames while hidden.
      webRaf = document.hidden ? null : requestAnimationFrame(drawWeb)
    }

    resizeWeb()
    drawWeb()

    window.addEventListener("resize", resizeWeb)
    const onMove = (e) => { mouse.x = e.clientX; mouse.y = e.clientY }
    window.addEventListener("mousemove", onMove)

    // Both loops stop rescheduling themselves once hidden (see the
    // document.hidden checks above) — this restarts whichever ones aren't
    // already running once the tab becomes visible again.
    function handleVisibilityChange() {
      if (!document.hidden) {
        if (!starRaf) drawStars()
        if (!webRaf) drawWeb()
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)

    // Cleanup
    return () => {
      window.removeEventListener("resize", resizeStar)
      window.removeEventListener("resize", resizeWeb)
      window.removeEventListener("mousemove", onMove)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      if (starRaf) cancelAnimationFrame(starRaf)
      if (webRaf) cancelAnimationFrame(webRaf)
      document.getElementById("starfield-bg")?.remove()
      document.getElementById("spiderweb-bg")?.remove()
      delete window.__starsData
      delete window.__webData
      delete window.__audioReactiveActive
    }
  }, [entered])

  return (
    <html lang="en">
      <body className="relative min-h-screen text-white">
        {/* Cosmic gradient + vignette sits at the very back */}
        <div className="cosmic-gradient" />

        {/* Cursor + audio-reactive starfield controller — deferred until the
            user has actually entered past the intro overlay (see the
            `entered` effect above); nothing behind an opaque overlay needs
            to be running. */}
        {entered && <CursorWrapper />}
        {entered && <AudioReactiveStarfield starsRef={starsRef} />}

        <BootWrapper onEntered={() => setEntered(true)}>{children}</BootWrapper>

      </body>
    </html>
  )
}