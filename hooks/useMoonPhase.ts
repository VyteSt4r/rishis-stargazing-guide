'use client'
import { useEffect, useState } from 'react'
import SunCalc from 'suncalc'

export interface MoonData {
  phase: number // 0-1, 0 = new moon, 0.5 = full moon
  illumination: number // 0-1
  phaseName: string
  phaseEmoji: string
  angle: number // Moon rotation angle
  moonrise: Date | null
  moonset: Date | null
  age: number // days since new moon
  nextNewMoon: Date
  nextFullMoon: Date
}

// Get moon phase name
function getMoonPhaseName(phase: number): string {
  if (phase < 0.03) return 'New Moon'
  if (phase < 0.22) return 'Waxing Crescent'
  if (phase < 0.28) return 'First Quarter'
  if (phase < 0.47) return 'Waxing Gibbous'
  if (phase < 0.53) return 'Full Moon'
  if (phase < 0.72) return 'Waning Gibbous'
  if (phase < 0.78) return 'Last Quarter'
  if (phase < 0.97) return 'Waning Crescent'
  return 'New Moon'
}

// Get moon emoji
function getMoonEmoji(phase: number): string {
  if (phase < 0.03) return '🌑'
  if (phase < 0.22) return '🌒'
  if (phase < 0.28) return '🌓'
  if (phase < 0.47) return '🌔'
  if (phase < 0.53) return '🌕'
  if (phase < 0.72) return '🌖'
  if (phase < 0.78) return '🌗'
  if (phase < 0.97) return '🌘'
  return '🌑'
}

// Calculate next new/full moon (approximate)
function calculateNextPhase(currentPhase: number, targetPhase: number): Date {
  const synodicMonth = 29.53059 // days (more precise)
  const now = new Date()
  
  let phaseDifference: number
  
  if (targetPhase === 0) {
    // Next new moon
    // If we're past 0.97, the next new moon is very close
    // Otherwise, calculate forward to phase 1.0 (which is same as 0)
    if (currentPhase >= 0.97) {
      phaseDifference = 1 - currentPhase
    } else if (currentPhase <= 0.03) {
      // Very close to new moon, skip to next cycle
      phaseDifference = 1 - currentPhase
    } else {
      // We're somewhere in the middle, go to end of cycle
      phaseDifference = 1 - currentPhase
    }
  } else {
    // Next full moon (0.5)
    if (currentPhase < 0.5) {
      // Haven't reached full moon yet this cycle
      phaseDifference = 0.5 - currentPhase
    } else {
      // Passed full moon, calculate next cycle's full moon
      phaseDifference = (1 - currentPhase) + 0.5
    }
  }
  
  const daysUntil = phaseDifference * synodicMonth
  const nextPhaseDate = new Date(now.getTime() + daysUntil * 24 * 60 * 60 * 1000)
  
  // Safety check: if calculated date is in the past, add one full cycle
  if (nextPhaseDate.getTime() < now.getTime()) {
    nextPhaseDate.setTime(nextPhaseDate.getTime() + synodicMonth * 24 * 60 * 60 * 1000)
  }
  
  return nextPhaseDate
}

export function useMoonPhase(lat: number = 12.9716, lon: number = 77.5946) {
  const [moonData, setMoonData] = useState<MoonData | null>(null)

  useEffect(() => {
    function updateMoonData() {
      const now = new Date()
      
      // Get moon illumination data
      const illumination = SunCalc.getMoonIllumination(now)
      
      // Get moon times
      const times = SunCalc.getMoonTimes(now, lat, lon)
      
      // Calculate moon age in days
      const age = illumination.phase * 29.53
      
      const data: MoonData = {
        phase: illumination.phase,
        illumination: illumination.fraction,
        phaseName: getMoonPhaseName(illumination.phase),
        phaseEmoji: getMoonEmoji(illumination.phase),
        angle: illumination.angle,
        moonrise: times.rise,
        moonset: times.set,
        age: age,
        nextNewMoon: calculateNextPhase(illumination.phase, 0),
        nextFullMoon: calculateNextPhase(illumination.phase, 0.5),
      }
      
      setMoonData(data)
    }

    updateMoonData()
    
    // Update every minute
    const interval = setInterval(updateMoonData, 60000)
    
    return () => clearInterval(interval)
  }, [lat, lon])

  return moonData
}
