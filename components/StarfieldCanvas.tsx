"use client"

import { useEffect, useMemo, useState } from 'react'
import { constellationLines, constellationStars } from '../lib/constellationData'
import { raDecToAltAz, radToDeg } from '../lib/astroMath'

type ObserverLocation = {
  lat: number
  lon: number
}

type StarPosition = {
  alt: number
  az: number
  x: number
  y: number
}

type ConstellationVisibility = {
  name: string
  bestAlt: number
  bestAzDeg: number
  direction: string
  stars: Record<string, StarPosition>
  lines: typeof constellationLines
}

const DEFAULT_LOCATION: ObserverLocation = { lat: 40.7128, lon: -74.006 }

const useObserverLocation = () => {
  const [location, setLocation] = useState<ObserverLocation>(DEFAULT_LOCATION)
  const [status, setStatus] = useState<'pending' | 'granted' | 'denied'>('pending')

  useEffect(() => {
    if (!navigator.geolocation) {
      setStatus('denied')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude })
        setStatus('granted')
      },
      () => setStatus('denied'),
      { enableHighAccuracy: true, timeout: 6000 }
    )
  }, [])

  return { location, status }
}

const projectToCircle = (az: number, alt: number, radius: number) => {
  const altDeg = radToDeg(alt)
  const r = radius * (1 - Math.max(0, Math.min(90, altDeg)) / 90)
  const x = r * Math.sin(az)
  const y = r * Math.cos(az) * -1
  return { x, y }
}

const bearingToDir = (deg: number) => {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const idx = Math.round(((deg % 360) / 45)) % 8
  return dirs[idx]
}

type StarfieldCanvasProps = {
  variant?: 'background' | 'panel'
}

export default function StarfieldCanvas({ variant = 'panel' }: StarfieldCanvasProps) {
  if (variant === 'background') {
    return null
  }

  const { location, status } = useObserverLocation()
  const [now, setNow] = useState<Date | null>(null)
  const [mounted, setMounted] = useState(false)
  const [selected, setSelected] = useState<ConstellationVisibility | null>(null)

  useEffect(() => {
    setMounted(true)
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const { visibleConstellations, belowHorizon } = useMemo(() => {
    if (!now) return { visibleConstellations: [], belowHorizon: [] }

    const starMap: Record<string, StarPosition> = {}
    constellationStars.forEach((star) => {
      const { alt, az } = raDecToAltAz(star.ra, star.dec, location.lat, location.lon, now)
      if (alt < -40 * (Math.PI / 180)) return // drop far-below targets to reduce noise
      const { x, y } = projectToCircle(az, alt, 140)
      starMap[star.id] = { alt, az, x, y }
    })

    const grouped = new Map<string, { lines: typeof constellationLines; ids: Set<string> }>()
    constellationLines.forEach((line) => {
      const entry = grouped.get(line.constellation) || { lines: [], ids: new Set<string>() }
      entry.lines.push(line)
      entry.ids.add(line.from)
      entry.ids.add(line.to)
      grouped.set(line.constellation, entry)
    })

    const vis: ConstellationVisibility[] = []
    grouped.forEach((entry, name) => {
      let bestAlt = -Infinity
      let bestAz = 0
      const starsForConst: Record<string, StarPosition> = {}
      entry.ids.forEach((id) => {
        const sp = starMap[id]
        if (!sp) return
        starsForConst[id] = sp
        if (sp.alt > bestAlt) {
          bestAlt = sp.alt
          bestAz = sp.az
        }
      })
      if (bestAlt === -Infinity) return
      const bearing = (radToDeg(bestAz) + 360) % 360
      vis.push({
        name,
        bestAlt,
        bestAzDeg: bearing,
        direction: bearingToDir(bearing),
        stars: starsForConst,
        lines: entry.lines
      })
    })

    const sorted = vis.sort((a, b) => b.bestAlt - a.bestAlt)
    return {
      visibleConstellations: sorted.filter((c) => c.bestAlt >= 0),
      belowHorizon: sorted.filter((c) => c.bestAlt < 0)
    }
  }, [location.lat, location.lon, now])

  const timeString = now?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  if (!mounted || !now) {
    return (
      <div className="relative h-full w-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 rounded-2xl border border-white/10 p-4 text-white flex items-center justify-center text-xs text-gray-300">
        Loading sky panel...
      </div>
    )
  }

  const statusFromAlt = (altDeg: number) => {
    if (altDeg >= 60) return 'High'
    if (altDeg >= 30) return 'Mid'
    if (altDeg >= 10) return 'Low'
    return 'Near horizon'
  }

  const iconPalette = [
    'linear-gradient(135deg, #22d3ee, #6366f1)',
    'linear-gradient(135deg, #f97316, #facc15)',
    'linear-gradient(135deg, #a855f7, #6366f1)',
    'linear-gradient(135deg, #10b981, #22d3ee)'
  ]

  return (
    <div
      className="relative h-full w-full rounded-2xl border border-white/10 p-4 text-white overflow-hidden"
      style={{
        backgroundImage:
          'radial-gradient(circle at 20% 20%, rgba(56,189,248,0.08), transparent 35%), radial-gradient(circle at 80% 10%, rgba(99,102,241,0.08), transparent 35%), radial-gradient(circle at 50% 80%, rgba(16,185,129,0.08), transparent 35%), linear-gradient(135deg, #0f172a, #0b1224)'
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{ backgroundImage: 'radial-gradient(#ffffff10 1px, transparent 1px)', backgroundSize: '40px 40px' }}
      />

      <div className="flex items-center justify-between mb-4 relative z-10">
        <div>
          <div className="text-sm font-semibold">Sky Panel (real-time)</div>
          <div className="text-xs text-gray-300">Visible constellations with quick directions</div>
        </div>
        <div className="text-xs text-gray-300 text-right">
          <div>
            {location.lat.toFixed(3)}°, {location.lon.toFixed(3)}° {status === 'denied' && '(fallback)'}
          </div>
          <div>{timeString}</div>
        </div>
      </div>

      {/* Horizon band */}
      <div className="relative z-10 mb-3">
        <div className="h-1 w-full bg-gradient-to-r from-cyan-400/60 via-white/60 to-cyan-400/60 rounded-full shadow-[0_0_18px_rgba(34,211,238,0.35)]" />
        <div className="flex justify-between text-[11px] text-gray-300 mt-1">
          <span>Horizon line</span>
          <span>Above / Below</span>
        </div>
      </div>

      <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1 relative z-10">
        {visibleConstellations.length === 0 && (
          <div className="text-xs text-gray-400">Calculating visibility...</div>
        )}
        {visibleConstellations.map((c, i) => {
          const altDeg = Math.max(0, Math.round(radToDeg(c.bestAlt)))
          const azDeg = Math.round(c.bestAzDeg)
          const statusLabel = statusFromAlt(altDeg)
          const color = iconPalette[i % iconPalette.length]
          const initial = c.name.slice(0, 2).toUpperCase()
          const altPct = Math.min(100, Math.max(0, Math.round((altDeg / 90) * 100)))

          return (
            <button
              type="button"
              key={c.name}
              onClick={() => setSelected(c)}
              className={`w-full text-left flex items-center justify-between rounded-xl px-3 py-3 border backdrop-blur-sm transition hover:border-cyan-400/50 hover:bg-white/10 ${
                selected?.name === c.name ? 'border-cyan-400/60 bg-white/10' : 'border-white/10 bg-white/5'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-lg"
                  style={{ background: color }}
                  aria-label={`${c.name} icon`}
                >
                  {initial}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white leading-tight">{c.name}</div>
                  <div className="text-[11px] text-gray-300">Direction {c.direction} · Az {azDeg}°</div>
                  <div className="mt-1 h-1.5 w-32 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full" style={{ width: `${altPct}%`, background: color }} />
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">Altitude {altDeg}° · {statusLabel}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 text-right">
                <div className="text-[11px] text-gray-300 text-left">
                  <div className="text-[10px] uppercase tracking-wide text-gray-400">Rank</div>
                  <div className="text-sm font-semibold text-white">#{i + 1}</div>
                </div>
                <div className="text-[11px] text-gray-300 text-left">
                  <div className="text-[10px] uppercase tracking-wide text-gray-400">Status</div>
                  <div className="text-sm font-semibold text-white">{statusLabel}</div>
                </div>
                <div className="text-[11px] text-gray-300 text-left">
                  <div className="text-[10px] uppercase tracking-wide text-gray-400">Alt</div>
                  <div className="text-sm font-semibold text-white">{altDeg}°</div>
                </div>
              </div>
            </button>
          )
        })}

        {belowHorizon.length > 0 && (
          <div className="pt-3 border-t border-white/10 mt-3">
            <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">Below horizon</div>
            {belowHorizon.map((c, i) => {
              const altDeg = Math.round(radToDeg(c.bestAlt))
              const azDeg = Math.round(c.bestAzDeg)
              const color = iconPalette[(i + 2) % iconPalette.length]
              return (
                <button
                  type="button"
                  key={c.name}
                  onClick={() => setSelected(c)}
                  className={`w-full text-left flex items-center justify-between rounded-xl px-3 py-3 border backdrop-blur-sm transition hover:border-cyan-400/50 hover:bg-white/5 ${
                    selected?.name === c.name ? 'border-cyan-400/60 bg-white/10' : 'border-white/10 bg-white/0'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="h-9 w-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white shadow"
                      style={{ background: color }}
                    >
                      {c.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white leading-tight">{c.name}</div>
                      <div className="text-[11px] text-gray-300">Rising soon · Az {azDeg}° · Alt {altDeg}°</div>
                    </div>
                  </div>
                  <div className="text-[11px] text-gray-300">Tap for details</div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {selected && (
        <div className="relative z-10 mt-4 rounded-xl border border-cyan-400/50 bg-black/50 backdrop-blur-xl p-4 shadow-[0_0_30px_rgba(34,211,238,0.35)]">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-sm uppercase tracking-wide text-cyan-200/80">Constellation</div>
              <div className="text-lg font-semibold text-white">{selected.name}</div>
              <div className="text-[11px] text-gray-300 mt-1">Direction {selected.direction} · Az {Math.round(selected.bestAzDeg)}°</div>
            </div>
            <button
              type="button"
              className="text-[11px] text-cyan-300 hover:text-white transition"
              onClick={() => setSelected(null)}
            >
              Close
            </button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-[11px] text-gray-200">
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-gray-400">Altitude</div>
              <div className="text-sm font-semibold text-white">{Math.round(Math.max(0, radToDeg(selected.bestAlt)))}°</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-gray-400">Azimuth</div>
              <div className="text-sm font-semibold text-white">{Math.round(selected.bestAzDeg)}°</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-gray-400">Status</div>
              <div className="text-sm font-semibold text-white">{selected.bestAlt >= 0 ? 'Above horizon' : 'Below horizon'}</div>
            </div>
          </div>
          <div className="mt-3 text-[11px] text-gray-300">
            Click any other card to preview its position and status.
          </div>
        </div>
      )}
    </div>
  )
}
