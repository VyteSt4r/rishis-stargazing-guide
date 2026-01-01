import Link from 'next/link'
import StarfieldCanvas from '../components/StarfieldCanvas'
import MapboxMap from '../components/MapboxMap'
import ISSTracker from '../components/ISSTracker'
import MoonPhase from '../components/MoonPhase'
import NightSkyConditions from '../components/NightSkyConditions'

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <header className="p-6 flex items-center justify-between relative z-10">
        <h1 className="text-2xl font-semibold">Rishi's Stargazing Guide</h1>
        <nav className="space-x-4">
          <button className="px-3 py-1 rounded bg-electric/10 text-electric">Dashboard</button>
          <Link 
            href="/stargazing"
            className="px-3 py-1 rounded bg-supernova/10 text-supernova hover:bg-supernova/20 transition-colors inline-block"
          >
            2D Sky 🌟
          </Link>
          <Link 
            href="/stellarium-sky"
            className="px-3 py-1 rounded bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 transition-colors inline-block"
          >
            Stellarium ✨
          </Link>
        </nav>
      </header>

      <div className="px-6 pb-6 relative z-10">
        <div className="h-[620px]">
          <StarfieldCanvas variant="panel" />
        </div>
      </div>

      <section className="p-6 grid gap-4 grid-cols-1 md:grid-cols-3">
        {/* Stellarium Web Engine */}
        <Link 
          href="/stellarium-sky"
          className="card col-span-1 md:col-span-3 bg-gradient-to-br from-yellow-900/30 to-orange-900/30 border-2 border-yellow-500/50 hover:border-yellow-400 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
                ✨ Stellarium Web - Official Planetarium Engine
                <span className="text-xs bg-yellow-500 text-black px-2 py-0.5 rounded-full font-bold">REAL</span>
              </h2>
              <p className="text-sm text-gray-300">
                Official Stellarium Web with 1.69 billion stars from Gaia catalog. Professional-grade WebGL planetarium with realistic atmosphere, Milky Way, and deep sky objects.
              </p>
            </div>
            <div className="text-4xl group-hover:scale-110 transition-transform">
              🌌
            </div>
          </div>
        </Link>

        {/* Original 2D Sky Viewer */}
        <Link 
          href="/stargazing"
          className="card col-span-1 md:col-span-3 bg-gradient-to-br from-blue-900/30 to-purple-900/30 border-2 border-blue-500/50 hover:border-blue-400 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
                🌟 2D Interactive Sky Viewer - Canvas Edition
              </h2>
              <p className="text-sm text-gray-300">
                Stellarium-inspired 2D fisheye projection. Explore constellations with realistic star rendering and deep sky objects.
              </p>
            </div>
            <div className="text-4xl group-hover:scale-110 transition-transform">
              🔭
            </div>
          </div>
        </Link>

        <div className="card col-span-1 md:col-span-2">
          <h2 className="text-lg font-medium mb-4">🗺️ Bortle Scale and ISS map</h2>
          <MapboxMap />
        </div>

        <div className="card">
          <h2 className="text-lg font-medium mb-3">☄️ Upcoming Meteor Showers</h2>
          <div className="space-y-3">
            <div className="p-2 rounded bg-gradient-to-r from-purple-900/30 to-transparent border-l-2 border-purple-400">
              <div className="flex justify-between items-center">
                <span className="font-medium text-purple-300">Perseids</span>
                <span className="text-xs bg-purple-500/30 px-2 py-0.5 rounded-full">Aug 11-13</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">Peak: ~100/hr • Best viewing after midnight</p>
            </div>
            <div className="p-2 rounded bg-gradient-to-r from-blue-900/30 to-transparent border-l-2 border-blue-400">
              <div className="flex justify-between items-center">
                <span className="font-medium text-blue-300">Orionids</span>
                <span className="text-xs bg-blue-500/30 px-2 py-0.5 rounded-full">Oct 20-22</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">Peak: ~20/hr • Halley's Comet debris</p>
            </div>
            <div className="p-2 rounded bg-gradient-to-r from-cyan-900/30 to-transparent border-l-2 border-cyan-400">
              <div className="flex justify-between items-center">
                <span className="font-medium text-cyan-300">Geminids</span>
                <span className="text-xs bg-cyan-500/30 px-2 py-0.5 rounded-full">Dec 13-14</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">Peak: ~150/hr • Year's best shower</p>
            </div>
            <div className="p-2 rounded bg-gradient-to-r from-yellow-900/30 to-transparent border-l-2 border-yellow-400">
              <div className="flex justify-between items-center">
                <span className="font-medium text-yellow-300">Quadrantids</span>
                <span className="text-xs bg-yellow-500/30 px-2 py-0.5 rounded-full">Jan 3-4</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">Peak: ~80/hr • Short 6-hour peak</p>
            </div>
          </div>
        </div>

        <div className="col-span-1">
          <ISSTracker />
        </div>

        <div className="col-span-1">
          <MoonPhase />
        </div>

        <div className="col-span-1">
          <NightSkyConditions />
        </div>

        <div className="card col-span-1">
          <h2 className="text-lg font-medium">📷 Astrophotography Calculator</h2>
          <p className="text-sm text-gray-300">500 Rule, suggested exposure for sharp stars</p>
          <div className="mt-2 text-xs text-gray-400">Coming soon...</div>
        </div>
      </section>
    </div>
  )
}
