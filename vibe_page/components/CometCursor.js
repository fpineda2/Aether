"use client"
import { useEffect, useRef } from "react"

const SMOKE_COUNT = 20

export default function CometCursor() {
  const headRef = useRef(null)
  const puffRefs = useRef([])
  const nextPuff = useRef(0) // round-robin index into the fixed puff pool

  useEffect(() => {
    const move = (e) => {
      if (headRef.current) {
        headRef.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`
      }

      // Recycle the oldest puff in the pool instead of mounting a new DOM
      // node per mousemove — reposition it, resize it, and restart its
      // fade animation.
      const el = puffRefs.current[nextPuff.current]
      nextPuff.current = (nextPuff.current + 1) % SMOKE_COUNT
      if (!el) return

      // Position via top/left (not transform) — the fade keyframe below
      // owns `transform` for its scale animation, so position has to live
      // on a different property or the two would fight over it.
      el.style.left = `${e.clientX + (Math.random() * 10 - 5)}px`
      el.style.top = `${e.clientY + (Math.random() * 10 - 5)}px`
      const size = Math.floor(Math.random() * 20) + 20
      el.style.width = `${size}px`
      el.style.height = `${size}px`

      // Restarting a CSS animation on a reused element requires forcing a
      // reflow between clearing and re-setting it, or the browser just
      // no-ops the re-assignment since the value "hasn't changed".
      el.style.animation = "none"
      void el.offsetWidth
      el.style.animation = "smokeFade 1.2s forwards"
    }

    window.addEventListener("mousemove", move)
    return () => window.removeEventListener("mousemove", move)
  }, [])

  return (
    <>
      {/* Comet Head */}
      <div
        ref={headRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "22px",
          height: "22px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, #fff 0%, #ffcc00 40%, #ff6600 70%, #cc0000 100%)",
          boxShadow:
            "0 0 25px 10px rgba(255,140,0,0.9), 0 0 50px 20px rgba(255,80,0,0.7)",
          transform: "translate(-9999px, -9999px)",
          pointerEvents: "none",
          zIndex: 2147483647,
          willChange: "transform",
        }}
      />

      {/* Smoke trail — fixed pool of divs, recycled + repositioned in place */}
      {Array.from({ length: SMOKE_COUNT }).map((_, index) => (
        <div
          key={index}
          ref={(el) => { puffRefs.current[index] = el }}
          style={{
            position: "fixed",
            top: "-9999px",
            left: "-9999px",
            width: "20px",
            height: "20px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(120,120,120,0.4) 0%, rgba(50,50,50,0.2) 60%, transparent 100%)",
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
            zIndex: 2147483646,
            opacity: 0,
            willChange: "transform, opacity",
          }}
        />
      ))}

      {/* Animation */}
      <style jsx global>{`
        @keyframes smokeFade {
          0% {
            opacity: 0.6;
            transform: scale(0.8) translate(-50%, -50%);
          }
          100% {
            opacity: 0;
            transform: scale(1.6) translate(-50%, -50%);
          }
        }
      `}</style>
    </>
  )
}
