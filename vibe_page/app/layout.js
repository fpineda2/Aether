"use client"

import "./globals.css"
import { useState, useEffect } from "react"
import BootWrapper from "../components/BootWrapper";
import CursorWrapper from "../components/CursorWrapper"

export default function RootLayout({ children }) {
  const [showIntro, setShowIntro] = useState(true)

  useEffect(() => {
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

    const sc = starCanvas.getContext("2d")
    const resizeStar = () => {
      starCanvas.width = window.innerWidth
      starCanvas.height = window.innerHeight
      initStars()
    }

    let stars = []
    function initStars() {
      const count = Math.floor((starCanvas.width * starCanvas.height) / 15000) // density scales with screen
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * starCanvas.width,
        y: Math.random() * starCanvas.height,
        r: Math.random() * 0.9 + 0.4, // 0.4–1.3 px
        a: Math.random() * Math.PI * 2, // phase
        s: Math.random() * 0.015 + 0.007, // twinkle speed
      }))
    }

    function drawStars() {
      sc.clearRect(0, 0, starCanvas.width, starCanvas.height)
      for (const st of stars) {
        st.a += st.s
        const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(st.a))
        sc.beginPath()
        sc.arc(st.x, st.y, st.r, 0, Math.PI * 2)
        sc.fillStyle = `rgba(255,255,255,${twinkle * 0.5})`
        sc.fill()
      }
      requestAnimationFrame(drawStars)
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
      particles = Array.from({ length: 145 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
      }))
    }

    function drawWeb() {
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
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 120) {
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(mouse.x, mouse.y)
            ctx.strokeStyle = `hsla(${hue}, 100%, 70%, ${1 - dist / 120})`
            ctx.stroke()
          }
        }
      })

      // particle-to-particle lines (colorized)
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
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
      requestAnimationFrame(drawWeb)
    }

    resizeWeb()
    drawWeb()

    window.addEventListener("resize", resizeWeb)
    const onMove = (e) => { mouse.x = e.clientX; mouse.y = e.clientY }
    window.addEventListener("mousemove", onMove)

    // Cleanup
    return () => {
      window.removeEventListener("resize", resizeStar)
      window.removeEventListener("resize", resizeWeb)
      window.removeEventListener("mousemove", onMove)
      document.getElementById("starfield-bg")?.remove()
      document.getElementById("spiderweb-bg")?.remove()
    }
  }, [])

  return (
    <html lang="en">
      <body className="relative min-h-screen text-white">
        {/* Cosmic gradient + vignette sits at the very back */}
        <div className="cosmic-gradient" />

        {/* Cursor + your UI */}
        <CursorWrapper />
        
      <BootWrapper>{children}</BootWrapper>

      </body>
    </html>
  )
}
