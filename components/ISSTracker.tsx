'use client'
import { useISSTracker } from '@/hooks/useISSTracker'
import { useEffect, useState } from 'react'

export default function ISSTracker() {
  const [userLocation, setUserLocation] = useState<{lat: number, lon: number} | null>(null)
  const [locationName, setLocationName] = useState<string>('Getting location...')
  
  // Set default location immediately
  useEffect(() => {
    // Default to Bangalore first
    setUserLocation({ lat: 12.9716, lon: 77.5946 })
    setLocationName('Bangalore')
    
    // Then try to get actual user location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude
          })
          // Reverse geocode to get location name
          fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`)
            .then(res => res.json())
            .then(data => {
              const city = data.address?.city || data.address?.town || data.address?.state || 'Your Location'
              setLocationName(city)
            })
            .catch(() => setLocationName('Your Location'))
        }
      )
    }
  }, [])
  
  const { position, nextPass, isLoading, passesLoading, passesError } = useISSTracker(
    userLocation?.lat,
    userLocation?.lon
  )

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000)
    return date.toLocaleString('en-IN', { 
      month: 'short',
      day: 'numeric',
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    })
  }

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${minutes}m ${secs}s`
  }

  const getTimeUntilPass = (timestamp: number) => {
    const now = Date.now()
    const passTime = timestamp * 1000
    const diff = passTime - now
    
    if (diff < 0) return 'Passing now!'
    
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    
    if (hours > 0) return `in ${hours}h ${minutes}m`
    return `in ${minutes}m`
  }

  if (isLoading || !position) {
    return (
      <div className="card h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin text-3xl">🛰️</div>
          <p className="text-sm text-gray-400">Loading ISS data...</p>
        </div>
      </div>
    )
  }

  if (!nextPass || (Array.isArray(nextPass) && nextPass.length === 0)) {
    if (passesError) {
      return (
        <div className="card h-full">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">🛰️</span>
            <div>
              <h3 className="text-lg font-semibold text-white">ISS Tracker</h3>
              <p className="text-xs text-gray-400">Unable to fetch pass data</p>
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-red-900/20 to-red-800/10 rounded-lg p-4 border border-red-500/20">
            <p className="text-sm text-red-300 mb-2">⚠️ API Error</p>
            <p className="text-xs text-gray-400">
              The ISS pass prediction service is temporarily unavailable. This usually happens due to:
            </p>
            <ul className="text-xs text-gray-500 mt-2 space-y-1 list-disc list-inside">
              <li>API rate limiting</li>
              <li>Service maintenance</li>
              <li>Network connectivity issues</li>
            </ul>
            <p className="text-xs text-gray-400 mt-3">
              The page will automatically retry. Current ISS position is still being tracked.
            </p>
          </div>

          {position && (
            <div className="mt-4 bg-gradient-to-br from-space/40 to-space/20 rounded-lg p-3 border border-white/10">
              <p className="text-xs text-gray-400 mb-2">Current ISS Position</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-500">Lat:</span> <span className="text-electric font-mono">{position.latitude.toFixed(2)}°</span>
                </div>
                <div>
                  <span className="text-gray-500">Lon:</span> <span className="text-nebula font-mono">{position.longitude.toFixed(2)}°</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )
    }
    
    return (
      <div className="card h-full">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">🛰️</span>
          <div>
            <h3 className="text-lg font-semibold text-white">ISS Tracker</h3>
            <p className="text-xs text-gray-400">Calculating passes over {locationName}</p>
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-space/40 to-space/20 rounded-lg p-4 border border-white/10">
          <div className="flex items-center justify-center gap-3">
            <div className="animate-spin text-2xl">⌛</div>
            <div>
              <p className="text-sm text-gray-300">Fetching pass predictions...</p>
              <p className="text-xs text-gray-500 mt-1">Location: {userLocation?.lat.toFixed(2)}°, {userLocation?.lon.toFixed(2)}°</p>
            </div>
          </div>
        </div>

        {position && (
          <div className="mt-4 pt-3 border-t border-white/10">
            <p className="text-xs text-gray-500 text-center">
              Current ISS Position: {position.latitude.toFixed(2)}°, {position.longitude.toFixed(2)}°
            </p>
          </div>
        )}
      </div>
    )
  }

  const nextPassData = Array.isArray(nextPass) ? nextPass : [nextPass]

  return (
    <div className="card h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🛰️</span>
          <div>
            <h3 className="text-lg font-semibold text-white">ISS Tracker</h3>
            <p className="text-xs text-gray-400">Next passes over {locationName}</p>
          </div>
        </div>
      </div>

      {/* Current ISS Position */}
      <div className="bg-gradient-to-br from-space/40 to-space/20 rounded-lg p-3 border border-white/10 mb-4">
        <p className="text-xs text-gray-400 mb-2">Current Position</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-gray-500">Latitude</p>
            <p className="text-sm font-mono text-electric">{position.latitude.toFixed(4)}°</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Longitude</p>
            <p className="text-sm font-mono text-nebula">{position.longitude.toFixed(4)}°</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Altitude</p>
            <p className="text-sm font-mono text-white">{position.altitude} km</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Speed</p>
            <p className="text-sm font-mono text-white">{position.velocity.toLocaleString()} km/h</p>
          </div>
        </div>
      </div>

      {/* Upcoming Passes */}
      <div>
        <p className="text-xs text-gray-400 mb-3">
          📍 Calculating passes over your location: <span className="text-white font-medium">{locationName}</span>
        </p>
        <div className="space-y-3">
          {nextPassData.map((pass: any, index: number) => {
            const passDate = new Date(pass.risetime * 1000)
            const isToday = passDate.toDateString() === new Date().toDateString()
            
            return (
              <div 
                key={index}
                className={`${
                  index === 0 
                    ? 'bg-gradient-to-r from-electric/20 to-nebula/20 border-electric/50 shadow-lg shadow-electric/10' 
                    : 'bg-space/30 border-white/10'
                } rounded-lg p-4 border`}
              >
                {index === 0 && (
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-electric uppercase tracking-wide">⭐ Next Pass</span>
                  </div>
                )}
                
                <div className="mb-2">
                  <p className="text-base text-white font-semibold mb-1">
                    🛰️ ISS will pass over your position
                  </p>
                  <p className="text-lg text-electric font-mono font-bold">
                    {isToday ? 'Today at ' : ''}{formatTime(pass.risetime)}
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-black/20 rounded px-2 py-1.5">
                    <p className="text-xs text-gray-400">Time Until Pass</p>
                    <p className="text-sm font-mono text-nebula font-semibold">
                      {getTimeUntilPass(pass.risetime)}
                    </p>
                  </div>
                  <div className="bg-black/20 rounded px-2 py-1.5">
                    <p className="text-xs text-gray-400">Visible Duration</p>
                    <p className="text-sm font-mono text-white font-semibold">
                      {formatDuration(pass.duration)}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Info footer */}
      <div className="mt-4 pt-3 border-t border-white/10">
        <div className="flex items-center justify-between text-xs">
          <p className="text-gray-500">
            Orbits every ~90min at {position.altitude}km
          </p>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-electric rounded-full animate-pulse"></span>
            <span className="text-electric font-mono">LIVE</span>
          </div>
        </div>
      </div>
    </div>
  )
}
