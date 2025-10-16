"use client"
import { useState, useEffect } from "react"

export default function StarCursor() {
  const [pos, setPos] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const move = (e) => setPos({ x: e.clientX, y: e.clientY })
    window.addEventListener("mousemove", move)
    return () => window.removeEventListener("mousemove", move)
  }, [])

  return (
    <div
      className="custom-cursor star-cursor"
      style={{
        top: `${pos.y}px`,
        left: `${pos.x}px`,
        transform: "translate(-50%, -50%)",
      }}
    />
  )
}
