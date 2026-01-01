'use client'
import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'

// Dark sky locations near Bangalore
const DARK_SKY_LOCATIONS = [
  { name: 'Yelagiri Hills', coordinates: [12.5886, 78.6569], bortle: 3, description: 'Hill station, 230km from Bangalore' },
  { name: 'Coorg (Kodagu)', coordinates: [12.3375, 75.8069], bortle: 2, description: 'Coffee plantations, 260km from Bangalore' },
  { name: 'Bandipur National Park', coordinates: [11.6868, 76.6413], bortle: 2, description: 'Wildlife sanctuary, 220km from Bangalore' },
  { name: 'Chikmagalur', coordinates: [13.3161, 75.7720], bortle: 3, description: 'Hill station, 245km from Bangalore' },
  { name: 'Sakleshpur', coordinates: [12.9441, 75.7849], bortle: 3, description: 'Western Ghats, 200km from Bangalore' }
]

// Dynamically import the map component to avoid SSR issues
const DynamicMap = dynamic(() => import('./LeafletMap'), { 
  ssr: false,
  loading: () => (
    <div className="h-96 w-full relative rounded-lg overflow-hidden bg-gray-900 flex items-center justify-center">
      <div className="text-gray-400">Loading map...</div>
    </div>
  )
})

export default function MapboxMap() {
  const [selectedLocation, setSelectedLocation] = useState<typeof DARK_SKY_LOCATIONS[0] | null>(null)

  const teleportToLocation = (location: typeof DARK_SKY_LOCATIONS[0]) => {
    setSelectedLocation(location)
  }

  return (
    <div className="h-96 w-full relative rounded-lg overflow-hidden">
      <DynamicMap selectedLocation={selectedLocation} />
      
      {/* Dark Sky Teleport Panel */}
      <div className="absolute top-4 right-4 card w-64 max-h-80 overflow-y-auto z-10">
        <h3 className="text-sm font-semibold mb-2 text-electric">🌌 Teleport to Dark Sky</h3>
        <div className="space-y-2">
          {DARK_SKY_LOCATIONS.map((location, index) => (
            <button
              key={index}
              onClick={() => teleportToLocation(location)}
              className={`w-full text-left p-2 rounded text-xs transition-all ${
                selectedLocation?.name === location.name 
                  ? 'bg-electric/20 border border-electric/40' 
                  : 'hover:bg-white/5'
              }`}
            >
              <div className="font-medium">{location.name}</div>
              <div className="text-gray-400">Bortle {location.bortle} • {location.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4" style={{ zIndex: 1000 }}>
        <div className="card backdrop-blur-md bg-black/80 border border-white/10">
          <h4 className="text-xs font-semibold mb-3 text-white flex items-center gap-2">
            <span className="w-2 h-2 bg-electric rounded-full"></span>
            Bortle Dark-Sky Scale
          </h4>
          <div className="space-y-1.5 text-[10px]">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full border border-white/20" style={{ backgroundColor: '#001a33' }}></div>
              <span className="text-gray-200 font-mono">1-2</span>
              <span className="text-gray-400">Excellent dark site</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full border border-white/20" style={{ backgroundColor: '#004d99' }}></div>
              <span className="text-gray-200 font-mono">3-4</span>
              <span className="text-gray-400">Rural sky</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full border border-white/20" style={{ backgroundColor: '#3399ff' }}></div>
              <span className="text-gray-200 font-mono">5</span>
              <span className="text-gray-400">Suburban</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full border border-white/20" style={{ backgroundColor: '#ff9900' }}></div>
              <span className="text-gray-200 font-mono">6</span>
              <span className="text-gray-400">Bright suburban</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full border border-white/20" style={{ backgroundColor: '#ff6600' }}></div>
              <span className="text-gray-200 font-mono">7</span>
              <span className="text-gray-400">Urban transition</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full border border-white/20" style={{ backgroundColor: '#ff3300' }}></div>
              <span className="text-gray-200 font-mono">8</span>
              <span className="text-gray-400">City sky</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full border border-white/20" style={{ backgroundColor: '#ff0000' }}></div>
              <span className="text-gray-200 font-mono">9</span>
              <span className="text-gray-400">Inner-city</span>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-white/10 text-[9px] text-gray-500">
            Data: 2021 Census · Bortle estimates
          </div>
        </div>
      </div>
    </div>
  )
}