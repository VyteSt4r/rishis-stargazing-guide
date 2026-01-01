"use client"
import { useEffect, useMemo, useState } from 'react'
import SunCalc from 'suncalc'

interface SkyConditions {
  cloudCover: number
  visibilityKm: number
  temperature: number
  humidity: number
  windSpeed: number
  moonIllumination: number
  score: number
  summary: string
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const formatSummary = (score: number) => {
  if (score >= 80) return 'Excellent — grab your scope!'
  if (score >= 60) return 'Good — worthwhile session'
  if (score >= 40) return 'Fair — some haze or moonlight'
  return 'Poor — clouds or bright moon'
}

export default function NightSkyConditions() {
  const [coords, setCoords] = useState({ lat: 12.9716, lon: 77.5946, label: 'Bangalore' })
  const [conditions, setConditions] = useState<SkyConditions | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Try to use browser geolocation for better relevance
  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        setCoords({ lat: latitude, lon: longitude, label: 'Your location' })
      },
      () => {
        /* silently fall back to default */
      },
      { maximumAge: 10 * 60 * 1000, timeout: 5000 }
    )
  }, [])

  useEffect(() => {
    const fetchConditions = async () => {
      setLoading(true)
      setError(null)
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&hourly=cloudcover,visibility,temperature_2m,windspeed_10m,relativehumidity_2m&forecast_days=1&timezone=auto`
        const res = await fetch(url)
        if (!res.ok) throw new Error('Weather API unavailable')
        const data = await res.json()

        const idx = 0 // take current/first hour
        const cloud = data.hourly?.cloudcover?.[idx] ?? 100
        const visibility = data.hourly?.visibility?.[idx] ?? 0
        const temp = data.hourly?.temperature_2m?.[idx] ?? 0
        const wind = data.hourly?.windspeed_10m?.[idx] ?? 0
        const humidity = data.hourly?.relativehumidity_2m?.[idx] ?? 0

        const moon = SunCalc.getMoonIllumination(new Date()).fraction * 100

        // Simple sky quality score (0-100)
        const score = clamp(
          100 - cloud * 0.6 - moon * 0.25 - wind * 0.6 - Math.max(0, (100 - humidity)) * 0.05,
          0,
          100
        )

        setConditions({
          cloudCover: cloud,
          visibilityKm: Math.round((visibility || 0) / 1000),
          temperature: temp,
          humidity,
          windSpeed: wind,
          moonIllumination: moon,
          score,
          summary: formatSummary(score)
        })
      } catch (err: any) {
        setError(err?.message || 'Unable to load sky conditions')
      } finally {
        setLoading(false)
      }
    }

    fetchConditions()
  }, [coords.lat, coords.lon])

  const gradients = useMemo(() => {
    if (!conditions) return 'linear-gradient(90deg, #0f172a, #111827)'
    const pct = conditions.score
    if (pct >= 80) return 'linear-gradient(90deg, #0ea5e9, #22d3ee)'
    if (pct >= 60) return 'linear-gradient(90deg, #0ea5e9, #4ade80)'
    if (pct >= 40) return 'linear-gradient(90deg, #f59e0b, #f97316)'
    return 'linear-gradient(90deg, #ef4444, #b91c1c)'
  }, [conditions])

  return (
    <div className="card h-full">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold">🌙 Night Sky Conditions</h2>
          <p className="text-xs text-gray-400">Real-time cloud cover, transparency & moonlight</p>
        </div>
        <button
          className="text-xs px-2 py-1 rounded bg-electric/10 text-electric border border-electric/20"
          onClick={() => {
            if (navigator.geolocation) {
              navigator.geolocation.getCurrentPosition(
                (pos) => setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: 'Your location' }),
                () => setError('Location access denied')
              )
            }
          }}
        >
          Use my location
        </button>
      </div>

      <div className="text-sm text-gray-300 mb-2">{coords.label}</div>

      {loading && <div className="text-xs text-gray-400">Loading conditions...</div>}
      {error && <div className="text-xs text-red-400">{error}</div>}

      {conditions && (
        <div className="space-y-3">
          <div
            className="w-full h-2 rounded-full"
            style={{ backgroundImage: gradients }}
          >
            <div
              className="h-2 rounded-full bg-white/10"
              style={{ width: `${conditions.score}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-300 font-semibold">Sky score</span>
            <span className="font-mono text-white">{Math.round(conditions.score)} / 100</span>
          </div>
          <div className="text-xs text-gray-400">{conditions.summary}</div>

          <div className="grid grid-cols-2 gap-3 text-xs text-gray-200">
            <div className="space-y-1">
              <div className="text-gray-400">Cloud cover</div>
              <div className="font-mono text-white">{Math.round(conditions.cloudCover)}%</div>
            </div>
            <div className="space-y-1">
              <div className="text-gray-400">Visibility</div>
              <div className="font-mono text-white">{conditions.visibilityKm} km</div>
            </div>
            <div className="space-y-1">
              <div className="text-gray-400">Moonlight</div>
              <div className="font-mono text-white">{conditions.moonIllumination.toFixed(1)}%</div>
            </div>
            <div className="space-y-1">
              <div className="text-gray-400">Wind</div>
              <div className="font-mono text-white">{conditions.windSpeed.toFixed(1)} km/h</div>
            </div>
            <div className="space-y-1">
              <div className="text-gray-400">Humidity</div>
              <div className="font-mono text-white">{Math.round(conditions.humidity)}%</div>
            </div>
            <div className="space-y-1">
              <div className="text-gray-400">Temp</div>
              <div className="font-mono text-white">{conditions.temperature.toFixed(1)}°C</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
