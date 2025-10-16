"use client"
import { useEffect, useState, useRef } from "react"

export default function CometCursor() {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [smoke, setSmoke] = useState([])
  const counterRef = useRef(0)

  useEffect(() => {
    const move = (e) => {
      setPos({ x: e.clientX, y: e.clientY })

      // Add a smoke puff
      counterRef.current += 1
      const puff = {
        id: counterRef.current,
        x: e.clientX + (Math.random() * 10 - 5), // random drift
        y: e.clientY + (Math.random() * 10 - 5),
        size: Math.floor(Math.random() * 20) + 20, // 20–40px
      }
      setSmoke((prev) => [...prev.slice(-20), puff]) // keep last 20 puffs
    }

    window.addEventListener("mousemove", move)
    return () => window.removeEventListener("mousemove", move)
  }, [])

  return (
    <>
      {/* 🔥 Comet Head */}
      <div
        style={{
          position: "fixed",
          top: `${pos.y}px`,
          left: `${pos.x}px`,
          width: "22px",
          height: "22px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, #fff 0%, #ffcc00 40%, #ff6600 70%, #cc0000 100%)",
          boxShadow:
            "0 0 25px 10px rgba(255,140,0,0.9), 0 0 50px 20px rgba(255,80,0,0.7)",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
          zIndex: 2147483647,
        }}
      />

      {/* 🌫️ Smoke Trail */}
      {smoke.map((puff) => (
        <div
          key={puff.id}
          style={{
            position: "fixed",
            top: `${puff.y}px`,
            left: `${puff.x}px`,
            width: `${puff.size}px`,
            height: `${puff.size}px`,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(120,120,120,0.4) 0%, rgba(50,50,50,0.2) 60%, transparent 100%)",
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
            zIndex: 2147483646,
            animation: "smokeFade 1.2s forwards",
          }}
        />
      ))}

      {/* Animations */}
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
