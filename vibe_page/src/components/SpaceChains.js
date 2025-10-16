// src/components/SpaceChains.jsx
"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Usage:
 * <SpaceChains
 *   pairs={[
 *     ["sidebar", "feed"],
 *     ["feed", "links"],
 *     ["links", "playlist"],
 *   ]}
 *   color="#b9e3ff"          // optional stroke color
 *   glow="#75c7ff"           // optional outer glow
 * />
 *
 * Each id in `pairs` should exist in the DOM:
 *   <section id="sidebar">...</section>
 *   <section id="feed">...</section>
 *   ...
 */
export default function SpaceChains({
  pairs = [],
  color = "#d7ecff",
  glow = "#7cc7ff",
}) {
  const svgRef = useRef(null)
  const [links, setLinks] = useState([])

  // --- helpers ---------------------------------------------------------------
  const centerOf = (el) => {
    const r = el.getBoundingClientRect()
    return {
      x: r.left + r.width / 2 + window.scrollX,
      y: r.top + r.height / 2 + window.scrollY,
    }
  }

  // create a slightly sagging cubic Bezier path between A and B
  const makePath = (a, b) => {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dist = Math.hypot(dx, dy)

    // sag proportional to distance (but clamped)
    const sag = Math.min(60, Math.max(10, dist * 0.08))

    // unit normal to the AB vector
    const nx = -dy / (dist || 1)
    const ny = dx / (dist || 1)

    // control points (push them “down” by sag along the normal)
    const c1 = { x: a.x + dx * 0.33 + nx * sag, y: a.y + dy * 0.33 + ny * sag }
    const c2 = { x: a.x + dx * 0.66 + nx * sag, y: a.y + dy * 0.66 + ny * sag }

    return `M ${a.x},${a.y} C ${c1.x},${c1.y} ${c2.x},${c2.y} ${b.x},${b.y}`
  }

  const recalc = () => {
    const next = []
    for (const [fromId, toId] of pairs) {
      const aEl = document.getElementById(fromId)
      const bEl = document.getElementById(toId)
      if (!aEl || !bEl) continue
      const a = centerOf(aEl)
      const b = centerOf(bEl)
      next.push({ id: `${fromId}__${toId}`, d: makePath(a, b) })
    }
    setLinks(next)
  }

  // --- lifecycle -------------------------------------------------------------
  useEffect(() => {
    recalc()

    // update on resize/scroll
    const onScroll = () => recalc()
    const onResize = () => recalc()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onResize)

    // update when watched elements move/resize (ResizeObserver)
    const ro = new ResizeObserver(() => recalc())
    pairs.forEach(([a, b]) => {
      const ea = document.getElementById(a)
      const eb = document.getElementById(b)
      if (ea) ro.observe(ea)
      if (eb) ro.observe(eb)
    })

    // a tiny RAF “debounce” to smooth rapid layout thrash
    let raf
    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(recalc)
    }
    window.addEventListener("orientationchange", schedule)

    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onResize)
      window.removeEventListener("orientationchange", schedule)
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(pairs)]) // re-run if pairs change

  return (
    <>
      {/* Inline styles just for this component (you can move them to globals.css if preferred) */}
      <style>{`
        @keyframes sway {
          0%   { transform: translateY(0px); }
          50%  { transform: translateY(2px); }
          100% { transform: translateY(0px); }
        }
        .spacechains-svg {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          pointer-events: none; /* let user interact with page */
          z-index: 12;          /* above canvas background, below panels/cursor controls */
        }
        .spacechains-link {
          filter: url(#spacechains-glow);
          stroke-linecap: round;
        }
        .spacechains-dashes {
          stroke-dasharray: 6 10; /* dotted “chain links” */
          opacity: 0.95;
        }
        .spacechains-core {
          stroke-linecap: round;
          opacity: 0.85;
        }
      `}</style>

      <svg
        ref={svgRef}
        className="spacechains-svg"
        viewBox={`0 0 ${Math.max(
          document.documentElement.scrollWidth,
          window.innerWidth
        )} ${Math.max(
          document.documentElement.scrollHeight,
          window.innerHeight
        )}`}
        preserveAspectRatio="none"
      >
        <defs>
          {/* Soft outer glow */}
          <filter id="spacechains-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Gradient for a tiny energy shimmer along the core */}
          <linearGradient id="spacechains-core-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={color} stopOpacity="0.6" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="100%" stopColor={color} stopOpacity="0.6" />
          </linearGradient>
        </defs>

        {links.map((link, i) => (
          <g
            key={link.id}
            className="sway-group"
            style={{
              animation: `sway ${3.5 + (i % 3) * 0.7}s ease-in-out ${i * 0.2}s infinite`,
            }}
          >
            {/* Outer glow stroke */}
            <path
              d={link.d}
              className="spacechains-link"
              stroke={glow}
              strokeWidth={6}
              fill="none"
              opacity={0.22}
            />
            {/* Dashed “chain” */}
            <path
              d={link.d}
              className="spacechains-link spacechains-dashes"
              stroke={color}
              strokeWidth={2.4}
              fill="none"
            />
            {/* Subtle bright core */}
            <path
              d={link.d}
              className="spacechains-link spacechains-core"
              stroke="url(#spacechains-core-grad)"
              strokeWidth={1.2}
              fill="none"
            />
          </g>
        ))}
      </svg>
    </>
  )
}
