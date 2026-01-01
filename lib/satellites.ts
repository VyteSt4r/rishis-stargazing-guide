import * as satellite from 'satellite.js'
import type { ObserverLocation } from '@/lib/skyCalculations'

export type SatelliteTLE = {
  name: string
  line1: string
  line2: string
}

export type SatelliteHorizontalPosition = {
  name: string
  satnum?: number
  altitude: number // degrees
  azimuth: number // degrees, 0=N, 90=E
  rangeKm: number
  inclinationDeg?: number
  meanMotionRevPerDay?: number
  periodMin?: number
}

export type CompiledSatellite = {
  name: string
  satnum?: number
  satrec: any
}

export function compileTles(tles: SatelliteTLE[]): CompiledSatellite[] {
  const out: CompiledSatellite[] = []
  for (const tle of tles) {
    try {
      const satrec = satellite.twoline2satrec(tle.line1, tle.line2)
      const satnum = typeof satrec?.satnum === 'number'
        ? satrec.satnum
        : (() => {
            const raw = Number.parseInt(tle.line1.slice(2, 7).trim(), 10)
            return Number.isFinite(raw) ? raw : undefined
          })()

      out.push({ name: tle.name, satnum, satrec })
    } catch {
      // ignore
    }
  }
  return out
}

export function computeSatelliteHorizontalPositions(
  tles: SatelliteTLE[],
  time: Date,
  observer: ObserverLocation,
): SatelliteHorizontalPosition[] {
  const compiled = compileTles(tles)
  return computeSatelliteHorizontalPositionsFromSatRecs(compiled, time, observer)
}

export function computeSatelliteHorizontalPositionsFromSatRecs(
  sats: CompiledSatellite[],
  time: Date,
  observer: ObserverLocation,
): SatelliteHorizontalPosition[] {
  const observerGd = {
    latitude: satellite.degreesToRadians(observer.latitude),
    longitude: satellite.degreesToRadians(observer.longitude),
    // ObserverLocation currently does not include elevation; assume sea-level.
    height: 0,
  }

  const out: SatelliteHorizontalPosition[] = []
  const now = time
  const gmst = satellite.gstime(now)

  for (const s of sats) {
    try {
      const pv = satellite.propagate(s.satrec, now) as any
      const positionEci = pv?.position
      if (!positionEci) continue

      const positionEcf = satellite.eciToEcf(positionEci, gmst)
      const look = satellite.ecfToLookAngles(observerGd as any, positionEcf as any)

      const altDeg = satellite.radiansToDegrees(look.elevation)
      const azDeg = (satellite.radiansToDegrees(look.azimuth) + 360) % 360

      const inclo = typeof s.satrec?.inclo === 'number' ? s.satrec.inclo : undefined
      const inclinationDeg = typeof inclo === 'number' ? satellite.radiansToDegrees(inclo) : undefined

      const no = typeof s.satrec?.no === 'number' ? s.satrec.no : undefined
      const meanMotionRevPerDay = typeof no === 'number' ? (no * 1440) / (2 * Math.PI) : undefined
      const periodMin = typeof meanMotionRevPerDay === 'number' && meanMotionRevPerDay > 0
        ? 1440 / meanMotionRevPerDay
        : undefined

      out.push({
        name: s.name,
        satnum: s.satnum,
        altitude: altDeg,
        azimuth: azDeg,
        rangeKm: look.rangeSat,
        inclinationDeg,
        meanMotionRevPerDay,
        periodMin,
      })
    } catch {
      // Ignore bad TLEs.
    }
  }

  return out
}
