'use client'
import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle, Polyline } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { generatePollutionZones, getBortleColor, getBortleDescription, getVisibleStars } from '@/lib/lightPollutionData'

interface ISSPosition {
  latitude: number
  longitude: number
  altitude: number
  velocity: number
}

// Custom ISS icon - actual ISS satellite representation
const createISSIcon = () => {
  return L.divIcon({
    className: 'iss-marker',
    html: `
      <div style="
        width: 50px;
        height: 50px;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
      ">
        <div style="
          font-size: 32px;
          filter: drop-shadow(0 0 15px rgba(255, 68, 68, 0.8));
          animation: pulse 2s ease-in-out infinite;
        ">🛰️</div>
      </div>
    `,
    iconSize: [50, 50],
    iconAnchor: [25, 25]
  })
}

// Fix Leaflet default markers
if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as any)._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png'
  })
}

// Dark sky locations near Bangalore
const DARK_SKY_LOCATIONS = [
  { name: 'Yelagiri Hills', coordinates: [12.5886, 78.6569] as [number, number], bortle: 3, description: 'Hill station, 230km from Bangalore' },
  { name: 'Coorg (Kodagu)', coordinates: [12.3375, 75.8069] as [number, number], bortle: 2, description: 'Coffee plantations, 260km from Bangalore' },
  { name: 'Bandipur National Park', coordinates: [11.6868, 76.6413] as [number, number], bortle: 2, description: 'Wildlife sanctuary, 220km from Bangalore' },
  { name: 'Chikmagalur', coordinates: [13.3161, 75.7720] as [number, number], bortle: 3, description: 'Hill station, 245km from Bangalore' },
  { name: 'Sakleshpur', coordinates: [12.9441, 75.7849] as [number, number], bortle: 3, description: 'Western Ghats, 200km from Bangalore' }
]

// Generate scientifically accurate light pollution zones
// Based on real 2021 census data, urban area measurements, and Bortle scale estimates
const LIGHT_POLLUTION_ZONES = generatePollutionZones();

// Custom marker icons showing Bortle scale numbers
const createCustomIcon = (bortle: number) => {
  const color = getBortleColor(bortle);
  
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        background: ${color};
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 0 15px rgba(0,0,0,0.7), 0 0 5px ${color};
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        color: white;
        font-size: 13px;
        text-shadow: 0 1px 2px rgba(0,0,0,0.5);
      ">${bortle}</div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  })
}

function MapController({ selectedLocation }: { selectedLocation: any }) {
  const map = useMap()
  
  useEffect(() => {
    if (selectedLocation) {
      map.flyTo(selectedLocation.coordinates, 10, { duration: 2 })
    }
  }, [selectedLocation, map])
  
  return null
}

interface LeafletMapProps {
  selectedLocation: any
}

function ISSTracker() {
  const [issPosition, setIssPosition] = useState<ISSPosition | null>(null)
  const map = useMap()
  
  useEffect(() => {
    const fetchISSPosition = async () => {
      try {
        console.log('Fetching ISS position from API...')
        const response = await fetch('/api/iss-position')
        if (response.ok) {
          const data = await response.json()
          console.log('ISS position data:', data)
          const position = {
            latitude: parseFloat(data.iss_position.latitude),
            longitude: parseFloat(data.iss_position.longitude),
            altitude: 408,
            velocity: 27600
          }
          console.log('Setting ISS position:', position)
          setIssPosition(position)
        } else {
          console.error('Failed to fetch ISS position, status:', response.status)
        }
      } catch (error) {
        console.error('Error fetching ISS position:', error)
      }
    }
    
    fetchISSPosition()
    const interval = setInterval(fetchISSPosition, 5000)
    return () => clearInterval(interval)
  }, [])
  
  if (!issPosition) {
    console.log('No ISS position yet')
    return null
  }
  
  console.log('Rendering ISS at position:', issPosition)
  
  // Generate ISS orbital ground track with anti-meridian handling
  // We show one full orbit centered on the current position (past + future)
  const inclination = 51.6 // ISS orbital inclination
  const orbitalPeriod = 92.68 // minutes per orbit
  const earthRotationRate = 360 / (24 * 60) // degrees per minute (~0.25)
  const segments = 240
  // Show the next full orbit starting from the current position (no backward path)
  const timeRange = orbitalPeriod // minutes forward

  const orbitalPathSegments: [number, number][][] = []
  let currentSegment: [number, number][] = []
  let prevLon: number | null = null
  let prevLat: number | null = null

  // Estimate current orbital phase from latitude (assumes eastbound ISS motion)
  const clampedRatio = Math.max(-1, Math.min(1, issPosition.latitude / inclination))
  const currentPhase = Number.isFinite(clampedRatio) ? Math.asin(clampedRatio) : 0

  // Always start the path exactly at the ISS current position
  currentSegment.push([issPosition.latitude, issPosition.longitude])
  prevLon = issPosition.longitude
  prevLat = issPosition.latitude

  for (let i = 1; i <= segments; i++) {
    // Time offset from now (0 to +1 orbit)
    const timeOffset = (i / segments) * timeRange

    // Phase progression through the orbit
    const phaseDelta = (timeOffset / orbitalPeriod) * 2 * Math.PI
    const phase = currentPhase + phaseDelta

    // Latitude follows inclination sinusoidally
    const lat = inclination * Math.sin(phase)

    // Ground track longitude: orbital motion (eastward) minus Earth's eastward rotation
    const alongTrack = (timeOffset / orbitalPeriod) * 360 // ISS completes 360° per orbit
    const earthRotation = timeOffset * earthRotationRate
    let lon = issPosition.longitude + alongTrack - earthRotation

    // Normalize longitude to [-180, 180]
    lon = ((lon + 180) % 360) - 180

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      continue
    }

    // Split the polyline when crossing the anti-meridian to avoid a long straight line.
    // Add boundary points at ±180 so the track still looks continuous.
    if (prevLon !== null && prevLat !== null) {
      const rawDelta = lon - prevLon
      if (Math.abs(rawDelta) > 180) {
        const crossingAtPositive180 = prevLon > 0 && lon < 0
        const crossingAtNegative180 = prevLon < 0 && lon > 0

        if (crossingAtPositive180 || crossingAtNegative180) {
          const crossLon1 = crossingAtPositive180 ? 180 : -180
          const crossLon2 = crossingAtPositive180 ? -180 : 180
          const lonAdjusted = crossingAtPositive180 ? lon + 360 : lon - 360
          const denom = lonAdjusted - prevLon
          const t = denom !== 0 ? (crossLon1 - prevLon) / denom : 0
          const tClamped = Math.max(0, Math.min(1, t))
          const latCross = prevLat + (lat - prevLat) * tClamped

          currentSegment.push([latCross, crossLon1])
          orbitalPathSegments.push(currentSegment)
          currentSegment = [[latCross, crossLon2]]
        } else {
          if (currentSegment.length > 0) {
            orbitalPathSegments.push(currentSegment)
            currentSegment = []
          }
        }
      }
    }

    currentSegment.push([lat, lon])
    prevLon = lon
    prevLat = lat
  }

  if (currentSegment.length > 0) {
    orbitalPathSegments.push(currentSegment)
  }
  
  return (
    <>
      {/* ISS visibility circle (max viewing range from ground) */}
      <Circle
        center={[issPosition.latitude, issPosition.longitude]}
        radius={2200000}
        pathOptions={{
          color: '#00D9FF',
          fillColor: '#00D9FF',
          fillOpacity: 0.03,
          weight: 1,
          dashArray: '8, 12',
          opacity: 0.3
        }}
      />
      
      {/* ISS orbital ground track */}
      {orbitalPathSegments.map((segment, index) => (
        <Polyline
          key={index}
          positions={segment}
          pathOptions={{
            color: '#FF3366',
            weight: 2.5,
            opacity: 0.7,
            lineCap: 'round',
            lineJoin: 'round'
          }}
        />
      ))}
      
      {/* ISS marker */}
      <Marker 
        position={[issPosition.latitude, issPosition.longitude]}
        icon={createISSIcon()}
        zIndexOffset={1000}
      >
        <Popup>
          <div className="text-xs">
            <strong className="text-electric text-sm">🛰️ International Space Station</strong>
            <div className="mt-2 space-y-1.5">
              <div>📍 <strong>Position:</strong></div>
              <div className="ml-4 space-y-0.5">
                <div>Lat: <span className="font-mono text-white">{issPosition.latitude.toFixed(4)}°</span></div>
                <div>Lon: <span className="font-mono text-white">{issPosition.longitude.toFixed(4)}°</span></div>
              </div>
              <div>📏 <strong>Altitude:</strong> <span className="font-mono text-supernova">{issPosition.altitude} km</span></div>
              <div>🚀 <strong>Velocity:</strong> <span className="font-mono text-nebula">{issPosition.velocity.toLocaleString()} km/h</span></div>
              <div>🔄 <strong>Orbital Period:</strong> <span className="font-mono text-white">~92.7 min</span></div>
              <div>📐 <strong>Inclination:</strong> <span className="font-mono text-white">51.6°</span></div>
            </div>
            <div className="mt-2 pt-2 border-t border-white/20 text-[10px] text-gray-400">
              ⏱️ Live tracking • Updates every 5s
            </div>
          </div>
        </Popup>
      </Marker>
    </>
  )
}

export default function LeafletMap({ selectedLocation }: LeafletMapProps) {
  return (
    <div className="h-full w-full relative">
      <style dangerouslySetInnerHTML={{__html: `
        .leaflet-container {
          background: #0d1117 !important;
          font-family: inherit;
        }
        .leaflet-tile {
          filter: brightness(0.5) contrast(1.3) saturate(0.5) !important;
        }
        .leaflet-control-attribution {
          background: rgba(0,0,0,0.7) !important;
          color: #666 !important;
          font-size: 9px !important;
          padding: 2px 4px !important;
        }
        .leaflet-control-attribution a {
          color: #2EE6FF !important;
        }
        .leaflet-popup-content-wrapper {
          background: rgba(15,15,15,0.95) !important;
          color: white !important;
          border-radius: 12px !important;
          border: 1px solid rgba(46, 230, 255, 0.3) !important;
          box-shadow: 0 4px 20px rgba(0,0,0,0.5) !important;
        }
        .leaflet-popup-content {
          margin: 8px !important;
        }
        .leaflet-popup-tip {
          background: rgba(15,15,15,0.95) !important;
          border: 1px solid rgba(46, 230, 255, 0.3) !important;
        }
        .leaflet-control-zoom {
          background: rgba(0,0,0,0.8) !important;
          border: 1px solid rgba(255,255,255,0.1) !important;
          border-radius: 8px !important;
        }
        .leaflet-control-zoom a {
          background: rgba(0,0,0,0.8) !important;
          color: white !important;
          border: none !important;
          width: 30px !important;
          height: 30px !important;
          line-height: 28px !important;
        }
        .leaflet-control-zoom a:hover {
          background: rgba(46, 230, 255, 0.2) !important;
        }
        .custom-marker {
          background: none !important;
          border: none !important;
        }
        .iss-marker {
          background: none !important;
          border: none !important;
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
      `}} />
      
      <MapContainer
        center={[20, 78]} // Center on India for better ISS viewing
        zoom={4}
        minZoom={2} // Allow zooming out to see full Earth
        maxZoom={18}
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
        attributionControl={true}
        scrollWheelZoom={true}
        doubleClickZoom={true}
        worldCopyJump={false}
        maxBounds={[[-90, -180], [90, 180]]}
        maxBoundsViscosity={1.0}
      >
        {/* Using OpenStreetMap standard tiles - Note: Disputed territories shown per OSM community guidelines */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | Light pollution data: 2021 Census + Bortle estimates'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        
        {/* Light pollution gradient circles (draw largest first) */}
        {LIGHT_POLLUTION_ZONES
          .sort((a: any, b: any) => b.radius - a.radius)
          .map((zone: any, index: number) => (
          <Circle
            key={index}
            center={zone.coordinates as [number, number]}
            radius={zone.radius}
            pathOptions={{
              fillColor: zone.color,
              fillOpacity: zone.opacity,
              color: zone.color,
              weight: 0,
              opacity: 0
            }}
          />
        ))}
        
        <MapController selectedLocation={selectedLocation} />
        
        {/* ISS Tracker */}
        <ISSTracker />
        
        {/* Dark sky location markers */}
        {DARK_SKY_LOCATIONS.map((location, index) => (
          <Marker
            key={index}
            position={location.coordinates}
            icon={createCustomIcon(location.bortle)}
          >
            <Popup>
              <div className="p-3">
                <h3 className="font-semibold text-base text-white mb-1">{location.name}</h3>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs px-2 py-1 rounded bg-electric/20 text-electric font-mono">
                    Bortle {location.bortle}
                  </span>
                  <span className="text-xs text-gray-300">
                    {getBortleDescription(location.bortle)}
                  </span>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed mb-1">{location.description}</p>
                <p className="text-xs text-gray-500 italic">~{getVisibleStars(location.bortle).toLocaleString()} visible stars</p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}