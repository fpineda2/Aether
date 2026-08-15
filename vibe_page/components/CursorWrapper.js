"use client"
import { useState, useEffect } from "react"
import dynamic from "next/dynamic"

// Only one variant is ever rendered at a time (see renderCursor below), so
// there's no reason to ship all three cursor engines in the same bundle —
// each loads on demand as the user picks it.
const CustomCursorGalaxy = dynamic(() => import("../components/CustomCursorGalaxy"), { ssr: false })
const BlackHoleCursor = dynamic(() => import("../components/BlackHoleCursor"), { ssr: false })
const CometCursor = dynamic(() => import("../components/CometCursor"), { ssr: false })

export default function CursorWrapper() {
  const [variant, setVariant] = useState("galaxy")
  const [enabled, setEnabled] = useState(true)
  const [collapsed, setCollapsed] = useState(false)

  // Hide/show system cursor
  useEffect(() => {
    const html = document.documentElement
    const body = document.body

    if (enabled) {
      body.style.cursor = "none"
      html.style.cursor = "none"
    } else {
      body.style.cursor = "auto"
      html.style.cursor = "auto"
    }

    return () => {
      body.style.cursor = "auto"
      html.style.cursor = "auto"
    }
  }, [enabled])

  const renderCursor = () => {
    if (!enabled) return null
    switch (variant) {
      case "blackhole":
        return <BlackHoleCursor />
      case "comet":
        return <CometCursor />
      case "galaxy":
      default:
        return <CustomCursorGalaxy />
    }
  }

  return (
    <>
      {renderCursor()}

      {/* Show full panel when enabled + not collapsed */}
      {enabled && !collapsed && (
        <div
          style={{
            position: "fixed",
            bottom: "20px",
            right: "20px",
            zIndex: 2147483647,
            background: "rgba(15, 15, 35, 0.95)",
            color: "white",
            padding: "20px",
            borderRadius: "12px",
            minWidth: "220px",
            boxShadow: "0 0 15px rgba(138, 43, 226, 0.7)",
            backdropFilter: "blur(6px)",
            transition: "opacity 0.3s ease, transform 0.3s ease",
          }}
        >
          <p
            style={{
              marginBottom: "10px",
              fontWeight: "bold",
              fontSize: "14px",
              color: "#b19cd9",
            }}
          >
            ✨ Cursor Controls
          </p>

          <select
            value={variant}
            onChange={(e) => setVariant(e.target.value)}
            style={{
              width: "100%",
              padding: "6px",
              marginBottom: "12px",
              background: "rgba(30,30,60,0.9)",
              color: "white",
              border: "1px solid rgba(138,43,226,0.6)",
              borderRadius: "6px",
              outline: "none",
              cursor: "pointer",
            }}
          >
            <option value="galaxy">🌌 Galaxy</option>
            <option value="blackhole">🕳 Black Hole</option>
            <option value="comet">☄️ Comet</option>
          </select>

          <button
            onClick={() => setEnabled(false)}
            style={{
              width: "100%",
              padding: "8px",
              marginBottom: "10px",
              background: "linear-gradient(90deg, #6a0dad, #8a2be2)",
              color: "white",
              fontWeight: "bold",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              boxShadow: "0 0 12px rgba(138,43,226,0.7)",
            }}
          >
            Disable Cursor
          </button>

          {/* Collapse button */}
          <button
            onClick={() => setCollapsed(true)}
            style={{
              width: "100%",
              padding: "6px",
              background: "rgba(60,60,100,0.9)",
              color: "white",
              border: "1px solid rgba(138,43,226,0.6)",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            Hide Panel
          </button>
        </div>
      )}

      {/* Show collapsed 🖱️ button when enabled + collapsed */}
{/* Show collapsed 🖱 button when enabled + collapsed */}
{enabled && collapsed && (
  <button
    onClick={() => setCollapsed(false)}
    style={{
      position: "fixed",
      bottom: "20px",
      right: "20px",
      zIndex: 2147483647,
      padding: "10px",
      background: "rgba(20,20,40,0.9)",
      color: "white",
      border: "1px solid rgba(138,43,226,0.6)",
      borderRadius: "50%",
      cursor: "pointer",
      boxShadow: "0 0 12px rgba(138,43,226,0.7)",
      fontSize: "20px",
    }}
  >
    🖱️
  </button>
)}


      {/* Show enable button if cursor is disabled */}
      {!enabled && (
        <button
          onClick={() => setEnabled(true)}
          style={{
            position: "fixed",
            bottom: "20px",
            right: "20px",
            zIndex: 2147483647,
            padding: "10px 16px",
            background: "linear-gradient(90deg, #6a0dad, #8a2be2)",
            color: "white",
            fontWeight: "bold",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            boxShadow: "0 0 12px rgba(138,43,226,0.7)",
          }}
        >
          Enable Custom Cursor
        </button>
      )}
    </>
  )
}
