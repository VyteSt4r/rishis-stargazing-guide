'use client'
import { useMoonPhase } from '@/hooks/useMoonPhase'
import { motion } from 'framer-motion'

export default function MoonPhase() {
  const moonData = useMoonPhase()

  if (!moonData) {
    return (
      <div className="card h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-electric border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-400 text-sm">Loading moon data...</p>
        </div>
      </div>
    )
  }

  const formatTime = (date: Date | null) => {
    if (!date) return '--:--'
    return date.toLocaleTimeString('en-IN', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    })
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-IN', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const isDarkSkyNight = moonData.illumination < 0.25

  return (
    <div className="card h-full relative overflow-hidden group hover:border-electric/40 transition-colors">
      {/* Background glow effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-nebula/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
      
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-2xl">🌙</span>
              Moon Phase
            </h3>
            <p className="text-xs text-gray-400 mt-1">{moonData.phaseName}</p>
          </div>
          {isDarkSkyNight && (
            <motion.div
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 3 }}
              className="bg-green-500/20 text-green-400 text-xs px-2 py-1 rounded-full border border-green-500/40"
            >
              🌟 Dark Sky Night
            </motion.div>
          )}
        </div>

        {/* Moon Visualization */}
        <div className="flex items-center justify-center mb-6">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
            className="relative"
          >
            <div className="text-8xl">
              {moonData.phaseEmoji}
            </div>
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ repeat: Infinity, duration: 4 }}
              className="absolute inset-0 bg-white/5 rounded-full blur-xl"
            ></motion.div>
          </motion.div>
        </div>

        {/* Illumination Bar */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <p className="text-xs text-gray-400">Illumination</p>
            <p className="text-sm font-mono text-electric">
              {(moonData.illumination * 100).toFixed(1)}%
            </p>
          </div>
          <div className="h-2 bg-space/50 rounded-full overflow-hidden border border-white/10">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${moonData.illumination * 100}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
              className="h-full bg-gradient-to-r from-electric to-nebula rounded-full"
            ></motion.div>
          </div>
        </div>

        {/* Moon Stats Grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-space/30 rounded-lg p-3 border border-white/5">
            <p className="text-xs text-gray-400 mb-1">🌅 Moonrise</p>
            <p className="text-sm font-mono text-supernova">
              {formatTime(moonData.moonrise)}
            </p>
          </div>
          <div className="bg-space/30 rounded-lg p-3 border border-white/5">
            <p className="text-xs text-gray-400 mb-1">🌇 Moonset</p>
            <p className="text-sm font-mono text-nebula">
              {formatTime(moonData.moonset)}
            </p>
          </div>
        </div>

        {/* Moon Age */}
        <div className="bg-gradient-to-r from-nebula/10 to-electric/10 rounded-lg p-3 border border-nebula/20 mb-3">
          <p className="text-xs text-gray-400 mb-1">Moon Age</p>
          <p className="text-lg font-mono text-white">
            {moonData.age.toFixed(1)} days
            <span className="text-xs text-gray-400 ml-2">
              (Synodic cycle: 29.53 days)
            </span>
          </p>
        </div>

        {/* Next Phases */}
        <div className="space-y-2 text-xs">
          <div className="flex justify-between items-center p-2 bg-space/20 rounded border border-white/5">
            <span className="text-gray-400 flex items-center gap-2">
              <span>🌑</span> Next New Moon
            </span>
            <span className="text-electric font-mono">{formatDate(moonData.nextNewMoon)}</span>
          </div>
          <div className="flex justify-between items-center p-2 bg-space/20 rounded border border-white/5">
            <span className="text-gray-400 flex items-center gap-2">
              <span>🌕</span> Next Full Moon
            </span>
            <span className="text-nebula font-mono">{formatDate(moonData.nextFullMoon)}</span>
          </div>
        </div>

        {/* Photography Tip */}
        {isDarkSkyNight && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-3 bg-green-500/10 rounded-lg border border-green-500/20"
          >
            <p className="text-xs text-green-400">
              <span className="font-semibold">📷 Perfect for astrophotography!</span>
              <br />
              Minimal moon interference for deep-sky imaging.
            </p>
          </motion.div>
        )}
      </div>
    </div>
  )
}
