// AudioReactiveStarfield.jsx
// Add this component to your layout to make the starfield and spiderweb pulse with music

"use client";

import { useEffect , useRef, useState} from 'react';

export default function AudioReactiveStarfield() {
  useEffect(() => {
    let currentIntensity = 0;
    let animationFrame = null;
    
    const pulseEffects = () => {
      const starCanvas = document.getElementById('starfield-bg');
      const webCanvas = document.getElementById('spiderweb-bg');
      
      // Pulse stars
      if (starCanvas && window.__starsData) {
        const sc = starCanvas.getContext('2d');
        const stars = window.__starsData;
        
        sc.clearRect(0, 0, starCanvas.width, starCanvas.height);
        
        for (const st of stars) {
          st.a += st.s;
          const baseTwinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(st.a));
          const beatPulse = 1 + currentIntensity * 1.2;
          const alpha = baseTwinkle * 0.5 * beatPulse;
          const size = st.r * (1 + currentIntensity * 0.6);
          
          sc.beginPath();
          sc.arc(st.x, st.y, size, 0, Math.PI * 2);
          sc.fillStyle = `rgba(255,255,255,${Math.min(alpha, 1)})`;
          
          if (currentIntensity > 0.6) {
            sc.shadowBlur = 20 * currentIntensity;
            sc.shadowColor = `rgba(147, 51, 234, ${currentIntensity * 0.8})`;
          }
          
          sc.fill();
          sc.shadowBlur = 0;
        }
      }
      
      // Pulse spiderweb
      if (webCanvas && window.__webData) {
        const ctx = webCanvas.getContext('2d');
        const { width, height, particles, mouse } = window.__webData;
        let { hue } = window.__webData;
        
        ctx.clearRect(0, 0, width, height);
        
        // Enhanced line width on beats
        ctx.lineWidth = 0.5 + (currentIntensity * 1.5);
        
        particles.forEach(p => {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < 0 || p.x > width) p.vx *= -1;
          if (p.y < 0 || p.y > height) p.vy *= -1;

          // Particle points - pulse size on beat
          const pointSize = 1.8 + (currentIntensity * 1.2);
          ctx.beginPath();
          ctx.arc(p.x, p.y, pointSize, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${0.9 + currentIntensity * 0.1})`;
          
          // Glow on strong beats
          if (currentIntensity > 0.6) {
            ctx.shadowBlur = 8 * currentIntensity;
            ctx.shadowColor = `rgba(147, 51, 234, ${currentIntensity})`;
          }
          ctx.fill();
          ctx.shadowBlur = 0;

          // Mouse attraction lines with beat pulse
          if (mouse.x != null && mouse.y != null) {
            const dx = p.x - mouse.x;
            const dy = p.y - mouse.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 120) {
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(mouse.x, mouse.y);
              
              // Brighter and more saturated on beats
              const lineAlpha = (1 - dist / 120) * (1 + currentIntensity * 0.5);
              const saturation = 100;
              const lightness = 70 + (currentIntensity * 15);
              
              ctx.strokeStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${lineAlpha})`;
              
              if (currentIntensity > 0.7) {
                ctx.shadowBlur = 10 * currentIntensity;
                ctx.shadowColor = `hsla(${hue}, 100%, 70%, ${currentIntensity * 0.6})`;
              }
              
              ctx.stroke();
              ctx.shadowBlur = 0;
            }
          }
        });

        // Particle-to-particle lines with beat pulse
        for (let i = 0; i < particles.length; i++) {
          for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 150) {
              ctx.beginPath();
              ctx.moveTo(particles[i].x, particles[i].y);
              ctx.lineTo(particles[j].x, particles[j].y);
              
              // Brighter lines on beats
              const lineAlpha = (1 - dist / 150) * (1 + currentIntensity * 0.4);
              const saturation = 100;
              const lightness = 70 + (currentIntensity * 15);
              
              ctx.strokeStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${lineAlpha})`;
              ctx.stroke();
            }
          }
        }

        // Continue hue rotation even in interactive mode
        hue = (hue + 0.3) % 360;
        window.__webData.hue = hue;
      }
      
      // Decay intensity smoothly
      currentIntensity *= 0.92;
      
      animationFrame = requestAnimationFrame(pulseEffects);
    };
    
    // Listen for audio pulse events
    const handleAudioPulse = (event) => {
      const { intensity } = event.detail;
      window.__audioReactiveActive = true;  // Flag of child that parent needs acess to (BACK UP) as well as another component (SHARED STATE) THAT BOTH SIDES PULL CONSTANTLY
      
      // Set intensity (smoothly interpolate)
      currentIntensity += (intensity - currentIntensity) * 0.5;
      
      // Start animation loop if not running
      if (!animationFrame) {
        pulseEffects();
      }
    };
    
    // Stop audio reactive mode
    const handleStopAudioReactive = () => {
      window.__audioReactiveActive = false;
      
      // Cancel animation
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
      
      currentIntensity = 0;
    };
    
    window.addEventListener('audio-pulse', handleAudioPulse); //Child  of another parent wintin another child. (Sibling) NEEDS COMMONN ANCESTOR TO OWN IT
    window.addEventListener('stop-audio-reactive', handleStopAudioReactive); // same as audio-pulse
    
    return () => {
      window.removeEventListener('audio-pulse', handleAudioPulse);
      window.removeEventListener('stop-audio-reactive', handleStopAudioReactive);
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
      window.__audioReactiveActive = false;
    };
  }, []);
  
  return null;
}