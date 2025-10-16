"use client"
import { useEffect, useState } from "react"

export default function BlackHoleCursor() {
  const [pos, setPos] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const move = (e) => setPos({ x: e.clientX, y: e.clientY })
    window.addEventListener("mousemove", move)
    return () => window.removeEventListener("mousemove", move)
  }, [])

  return (
    <div
      style={{
        position: "fixed",
        top: `${pos.y}px`,
        left: `${pos.x}px`,
        width: "28px",
        height: "28px",
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(0,0,0,1) 50%, rgba(100,0,200,0.6) 100%)",
        boxShadow: "0 0 25px 10px rgba(100,0,200,0.7), inset 0 0 15px rgba(255,255,255,0.3)",
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
        zIndex: 2147483647,
      }}
    />
  )
}
