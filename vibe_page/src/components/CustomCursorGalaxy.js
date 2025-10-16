// src/components/CustomCursorGalaxy.js
"use client"
import { useEffect, useState, useRef } from "react"

export default function CustomCursorGalaxy() {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [trail, setTrail] = useState([])
  const counterRef = useRef(0)

  useEffect(() => {
    const move = (e) => {
      setPos({ x: e.clientX, y: e.clientY })

      counterRef.current += 1
      const newDot = {
        id: counterRef.current,
        x: e.clientX,
        y: e.clientY,
      }

      // keep only last 10 dots
      setTrail((prev) => [...prev.slice(-9), newDot])
    }

    window.addEventListener("mousemove", move)
    return () => window.removeEventListener("mousemove", move)
  }, [])

  return (
    <>
      {/* Main glowing orb */}
      <div
        style={{
          position: "fixed",
          top: `${pos.y}px`,
          left: `${pos.x}px`,
          width: "24px",
          height: "24px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(255,0,255,1) 0%, rgba(0,255,255,1) 100%)",
          boxShadow:
            "0 0 20px 6px rgba(255,0,255,0.7), 0 0 40px 12px rgba(0,255,255,0.5)",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
          zIndex: 2147483647,
        }}
      />

      {/* Stardust trail */}
      {trail.map((dot, index) => (
        <div
          key={dot.id}
          style={{
            position: "fixed",
            top: `${dot.y}px`,
            left: `${dot.x}px`,
            width: `${8 - index * 0.5}px`,
            height: `${8 - index * 0.5}px`,
            borderRadius: "50%",
            background: `hsl(${(index * 36) % 360}, 100%, 70%)`,
            opacity: 1 - index * 0.1,
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
            zIndex: 2147483646,
          }}
        />
      ))}
    </>
  )
}
