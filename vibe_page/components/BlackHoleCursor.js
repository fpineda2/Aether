"use client"
import { useEffect, useRef } from "react"

export default function BlackHoleCursor() {
  const dotRef = useRef(null)

  useEffect(() => {
    // Mutate the DOM node directly instead of useState — mousemove fires far
    // too often to route through React's render cycle for a single dot.
    const move = (e) => {
      const el = dotRef.current
      if (el) el.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`
    }
    window.addEventListener("mousemove", move)
    return () => window.removeEventListener("mousemove", move)
  }, [])

  return (
    <div
      ref={dotRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "28px",
        height: "28px",
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(0,0,0,1) 50%, rgba(100,0,200,0.6) 100%)",
        boxShadow: "0 0 25px 10px rgba(100,0,200,0.7), inset 0 0 15px rgba(255,255,255,0.3)",
        transform: "translate(-9999px, -9999px)", // parked off-screen until the first mousemove
        pointerEvents: "none",
        zIndex: 2147483647,
        willChange: "transform",
      }}
    />
  )
}
