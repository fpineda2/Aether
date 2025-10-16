"use client"

import { useEffect, useRef } from "react"

/**
 * Intro – 3D-ish nebula sphere with atmosphere, pulse, and parallax tilt.
 * Calls onStart() on click or Enter/Space.
 */
export default function Intro({ onStart }) {
  const canvasRef = useRef(null)
  const cardRef = useRef(null)

  // ---------------- Seeded starfield (draw-once) ----------------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d", { alpha: true })

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = window.innerWidth
      const h = window.innerHeight
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      drawStars(w, h)
    }

    // deterministic PRNG so stars don’t jump on hydration
    function mulberry32(a) {
      return function () {
        let t = (a += 0x6d2b79f5)
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
    }

    const drawStars = (w, h) => {
      ctx.clearRect(0, 0, w, h)
      const rnd = mulberry32(0x4f1a7c)
      const count = Math.round((w * h) / 14000)
      for (let i = 0; i < count; i++) {
        const x = rnd() * w
        const y = rnd() * h
        const r = 0.6 + rnd() * 1.6
        const a = 0.35 + rnd() * 0.45
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3)
        g.addColorStop(0, `rgba(255,255,255,${a})`)
        g.addColorStop(1, `rgba(255,255,255,0)`)
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x, y, r * 3, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    size()
    const onResize = () => size()
    window.addEventListener("resize", onResize)

    // light parallax (we transform the canvas only — no redraw)
    const onMove = (e) => {
      const w = window.innerWidth
      const h = window.innerHeight
      const dx = (e.clientX / w - 0.5) * 12
      const dy = (e.clientY / h - 0.5) * 12
      canvas.style.transform = `translate3d(${dx}px, ${dy}px, 0)`
    }
    window.addEventListener("pointermove", onMove)

    return () => {
      window.removeEventListener("resize", onResize)
      window.removeEventListener("pointermove", onMove)
    }
  }, [])

  // ---------------- Orb tilt / parallax ----------------
  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    const onMove = (e) => {
      const rect = el.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const dx = (e.clientX - cx) / rect.width
      const dy = (e.clientY - cy) / rect.height
      el.style.setProperty("--rx", `${dy * -12}deg`)
      el.style.setProperty("--ry", `${dx * 18}deg`)
      el.style.setProperty("--light-x", `${50 + dx * 25}%`)
      el.style.setProperty("--light-y", `${50 + dy * 25}%`)
    }
    const reset = () => {
      el.style.setProperty("--rx", `0deg`)
      el.style.setProperty("--ry", `0deg`)
      el.style.setProperty("--light-x", `50%`)
      el.style.setProperty("--light-y", `50%`)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerleave", reset)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerleave", reset)
    }
  }, [])

  // keyboard start
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        onStart?.()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onStart])

  return (
    <div className="fixed inset-0 z-[60] isolate overflow-hidden bg-[#070915] text-white">
      {/* cosmic wash under the stars */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.55]"
        style={{
          background:
            "radial-gradient(70rem 70rem at 30% 35%, rgba(124,58,237,0.24) 0%, rgba(7,9,21,0) 60%), radial-gradient(50rem 50rem at 75% 60%, rgba(59,130,246,0.16) 0%, rgba(7,9,21,0) 62%), radial-gradient(40rem 40rem at 80% 25%, rgba(236,72,153,0.10) 0%, rgba(7,9,21,0) 60%)",
        }}
      />

      {/* starfield */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 will-change-transform"
        style={{ transition: "transform 240ms ease-out" }}
      />

      {/* center cluster */}
      <div className="relative z-10 grid h-full place-items-center">
        <div
          ref={cardRef}
          className="relative flex flex-col items-center"
          style={{
            perspective: "1200px",
            transformStyle: "preserve-3d",
          }}
        >
          {/* atmosphere + light scattering */}
          <div
            aria-hidden
            className="absolute -inset-16 rounded-full blur-2xl opacity-60 animate-aurora"
            style={{
              background:
                "conic-gradient(from 0deg, rgba(168,85,247,0.00) 0deg, rgba(168,85,247,0.35) 80deg, rgba(59,130,246,0.35) 180deg, rgba(236,72,153,0.35) 270deg, rgba(168,85,247,0.00) 360deg)",
              transform: "translateZ(-60px)",
            }}
          />

          {/* shadow under sphere (depth) */}
          <div
            aria-hidden
            className="absolute inset-x-0 -bottom-12 mx-auto h-16 w-2/3 blur-2xl opacity-50"
            style={{
              background:
                "radial-gradient(50% 100% at 50% 0%, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 70%)",
              transform: "translateZ(-80px)",
            }}
          />

          {/* 3D Nebula Sphere */}
          <div
            className="relative grid place-items-center"
            style={{
              transform: "translateZ(0px) rotateX(var(--rx,0)) rotateY(var(--ry,0))",
              transition: "transform 120ms ease-out",
            }}
          >
            {/* outer glow shell */}
            <div
              aria-hidden
              className="absolute h-[20rem] w-[20rem] rounded-full blur-3xl opacity-70 animate-breathe-slow"
              style={{
                background:
                  "radial-gradient(circle at 50% 50%, rgba(99,102,241,0.35), rgba(99,102,241,0) 60%)",
                transform: "translateZ(-30px)",
              }}
            />

            {/* sphere body with layered gradients to fake depth */}
            <div
              className="relative h-[15rem] w-[15rem] rounded-full"
              style={{
                // core shading: night side + color bands + subsurface glow
                background:
                  `
                  radial-gradient(60% 60% at var(--light-x,50%) var(--light-y,50%),
                    rgba(255,255,255,0.95) 0%,
                    rgba(236,72,153,0.85) 15%,
                    rgba(139,92,246,0.85) 32%,
                    rgba(67,56,202,0.95) 65%,
                    rgba(30,27,75,1) 100%
                  ),
                  radial-gradient(120% 120% at 40% 35%,
                    rgba(255,255,255,0.25) 0%,
                    rgba(255,255,255,0.0) 55%
                  )
                  `,
                boxShadow:
                  "0 14px 70px rgba(124,58,237,0.35), inset 0 0 28px rgba(255,255,255,0.25)",
                transform: "translateZ(30px)",
              }}
            >
              {/* rim light + specular sweep */}
              <div
                aria-hidden
                className="absolute inset-0 rounded-full mix-blend-screen opacity-70"
                style={{
                  background:
                    "conic-gradient(from 210deg at 50% 50%, rgba(255,255,255,0.0) 0deg, rgba(255,255,255,0.16) 90deg, rgba(255,255,255,0.0) 180deg, rgba(255,255,255,0.18) 270deg, rgba(255,255,255,0.0) 360deg)",
                  filter: "blur(4px)",
                }}
              />

              {/* rotating “nebula clouds” to give volume */}
              <div
                aria-hidden
                className="absolute inset-0 rounded-full overflow-hidden"
                style={{ transform: "translateZ(40px)" }}
              >
                <div
                  className="absolute -inset-8 animate-clouds"
                  style={{
                    background:
                      "radial-gradient(90% 90% at 60% 40%, rgba(168,85,247,0.08) 0%, rgba(168,85,247,0) 60%), radial-gradient(60% 60% at 40% 60%, rgba(59,130,246,0.10) 0%, rgba(59,130,246,0) 60%), radial-gradient(70% 70% at 50% 50%, rgba(236,72,153,0.07) 0%, rgba(236,72,153,0) 60%)",
                    filter: "blur(10px)",
                  }}
                />
              </div>

              {/* cross flare (subtle) */}
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-[2px] w-[15rem] -translate-x-1/2 -translate-y-1/2 bg-white/25" />
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-[15rem] w-[2px] -translate-x-1/2 -translate-y-1/2 bg-white/25" />

              {/* star sparkle specks on top */}
              <div className="pointer-events-none absolute inset-0">
                {[...Array(14)].map((_, i) => (
                  <span
                    key={i}
                    className="absolute rounded-full"
                    style={{
                      left: `${12 + ((i * 73) % 76)}%`,
                      top: `${18 + ((i * 41) % 64)}%`,
                      width: `${Math.max(1.5, (i % 3) + 1)}px`,
                      height: `${Math.max(1.5, (i % 3) + 1)}px`,
                      background: "white",
                      boxShadow: "0 0 10px rgba(255,255,255,0.4)",
                      opacity: 0.7,
                      animation: `twinkle ${3 + (i % 5)}s ease-in-out ${i * 0.2}s infinite`,
                    }}
                  />
                ))}
              </div>
            </div>

            {/* breathing aura ring */}
            <div
              aria-hidden
              className="absolute h-[19rem] w-[19rem] rounded-full blur-2xl animate-breathe"
              style={{
                background:
                  "radial-gradient(closest-side, rgba(168,85,247,0.35), rgba(168,85,247,0) 80%)",
                transform: "translateZ(10px)",
              }}
            />
          </div>

          {/* CTA */}
          <button
            onClick={onStart}
            className="mt-7 rounded-xl px-7 py-3 font-semibold text-white shadow-lg shadow-fuchsia-700/30 transition-transform hover:scale-[1.03] focus:outline-none focus:ring-2 focus:ring-fuchsia-400/60"
            style={{
              background: "linear-gradient(90deg, #ec4899 0%, #8b5cf6 100%)",
              textShadow: "0 1px 10px rgba(255,255,255,0.25)",
              transform: "translateZ(60px)",
            }}
          >
            🚀 Start Experience
          </button>
        </div>
      </div>

      {/* local CSS for animations */}
      <style jsx global>{`
        @keyframes aurora {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .animate-aurora { animation: aurora 28s linear infinite; }

        @keyframes breathe {
          0%,100% { transform: scale(1);    opacity: 0.8; }
          50%     { transform: scale(1.06); opacity: 1.0; }
        }
        .animate-breathe { animation: breathe 6s ease-in-out infinite; }
        .animate-breathe-slow { animation: breathe 10s ease-in-out infinite; }

        @keyframes clouds {
          0%   { transform: rotate(0deg) scale(1); }
          50%  { transform: rotate(180deg) scale(1.03); }
          100% { transform: rotate(360deg) scale(1); }
        }
        .animate-clouds { animation: clouds 38s linear infinite; }

        @keyframes twinkle {
          0%,100% { opacity: 0.6; filter: drop-shadow(0 0 6px rgba(255,255,255,0.35)); }
          50%     { opacity: 1;   filter: drop-shadow(0 0 10px rgba(255,255,255,0.6)); }
        }
      `}</style>
    </div>
  )
}
