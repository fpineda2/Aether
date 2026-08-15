// src/components/CustomCursorGalaxy.js
"use client"
import { useEffect, useRef } from "react"

const TRAIL_LENGTH = 10

export default function CustomCursorGalaxy() {
  const orbRef = useRef(null)
  const trailRefs = useRef([])
  // A fixed-size ring buffer of trail positions, mutated in place — the
  // dots themselves are rendered once below and just repositioned here,
  // never re-rendered through React on mousemove.
  const positions = useRef(Array.from({ length: TRAIL_LENGTH }, () => ({ x: -9999, y: -9999 })))

  useEffect(() => {
    const move = (e) => {
      if (orbRef.current) {
        orbRef.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`
      }

      const pos = positions.current
      for (let i = pos.length - 1; i > 0; i--) pos[i] = pos[i - 1]
      pos[0] = { x: e.clientX, y: e.clientY }

      for (let i = 0; i < pos.length; i++) {
        const el = trailRefs.current[i]
        if (el) el.style.transform = `translate(${pos[i].x}px, ${pos[i].y}px) translate(-50%, -50%)`
      }
    }

    window.addEventListener("mousemove", move)
    return () => window.removeEventListener("mousemove", move)
  }, [])

  return (
    <>
      {/* Main glowing orb */}
      <div
        ref={orbRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "24px",
          height: "24px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(255,0,255,1) 0%, rgba(0,255,255,1) 100%)",
          boxShadow:
            "0 0 20px 6px rgba(255,0,255,0.7), 0 0 40px 12px rgba(0,255,255,0.5)",
          transform: "translate(-9999px, -9999px)",
          pointerEvents: "none",
          zIndex: 2147483647,
          willChange: "transform",
        }}
      />

      {/* Stardust trail — fixed pool of divs, repositioned in place */}
      {Array.from({ length: TRAIL_LENGTH }).map((_, index) => (
        <div
          key={index}
          ref={(el) => { trailRefs.current[index] = el }}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: `${8 - index * 0.5}px`,
            height: `${8 - index * 0.5}px`,
            borderRadius: "50%",
            background: `hsl(${(index * 36) % 360}, 100%, 70%)`,
            opacity: 1 - index * 0.1,
            transform: "translate(-9999px, -9999px)",
            pointerEvents: "none",
            zIndex: 2147483646,
            willChange: "transform",
          }}
        />
      ))}
    </>
  )
}
