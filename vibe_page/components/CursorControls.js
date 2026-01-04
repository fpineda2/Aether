"use client"
import { useEffect, useState } from "react"
import CustomCursorGalaxy from "../components/CustomCursorGalaxy"

export default function CursorControls() {
  const [variant, setVariant] = useState("galaxy") // default = galaxy
  const [enabled, setEnabled] = useState(true)

  // System cursor visibility (parent controls it so it always runs)
  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    if (enabled) {
      html.classList.add("cursor-hidden")
      body.classList.add("cursor-hidden")
    } else {
      html.classList.remove("cursor-hidden")
      body.classList.remove("cursor-hidden")
    }
    return () => {
      // safety on unmount
      html.classList.remove("cursor-hidden")
      body.classList.remove("cursor-hidden")
    }
  }, [enabled])

  return (
    <>
      {/* Always render; the child respects `enabled` */}
      <CustomCursorGalaxy variant={variant} enabled={enabled} />

      {/* Controls stacked bottom-right */}
      <div
        style={{
          position: "fixed",
          bottom: "16px",
          right: "16px",
          zIndex: 100000,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: "12px",
        }}
      >
        {/* Dropdown */}
        <select
          value={variant}
          onChange={(e) => setVariant(e.target.value)}
          style={{
            padding: "6px 12px",
            borderRadius: "8px",
            background: "white",
            boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
            fontSize: "14px",
          }}
        >
          <option value="galaxy">Galaxy ✨</option>
          <option value="comet">Comet ☄️</option>
          <option value="blackhole">Black Hole 🕳️</option>
        </select>

        {/* Enable/Disable Button */}
        <button
          onClick={() => setEnabled((prev) => !prev)}
          className="px-5 py-2 rounded-full font-semibold text-white shadow-lg transition
                     bg-gradient-to-r from-purple-500/60 via-pink-500/60 to-blue-500/60
                     backdrop-blur-md border border-white/20
                     hover:scale-105 hover:shadow-[0_0_25px_rgba(147,51,234,0.8)] animate-nebula"
        >
          {enabled ? "Disable Cursor ✨" : "Enable Cursor 🌌"}
        </button>
      </div>
    </>
  )
}
