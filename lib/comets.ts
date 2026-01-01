import * as Astronomy from 'astronomy-engine'
import type { ObserverLocation } from '@/lib/skyCalculations'

export type CometElements = {
  packed: string
  name: string
  perihelionTimeUtc: string // ISO
  perihelionDistanceAu: number // q
  eccentricity: number // e
  argPerihelionDeg: number // w
  ascNodeDeg: number // node
  inclinationDeg: number // i
  epochYmd?: string
  magnitudeG?: number | null // M1
  magnitudeK?: number | null // K1
}

export type CometHorizontalPosition = {
  name: string
  packed: string
  altitude: number
  azimuth: number
  helioDistanceAu: number
  geoDistanceAu: number
}

const DEG2RAD = Math.PI / 180
const OBLIQUITY_J2000_DEG = 23.439291111

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x))
}

function rotateEclipticToEquatorialJ2000(ecl: { x: number; y: number; z: number }) {
  const eps = OBLIQUITY_J2000_DEG * DEG2RAD
  const cosE = Math.cos(eps)
  const sinE = Math.sin(eps)

  // Rotate around X axis by +epsilon.
  const x = ecl.x
  const y = ecl.y * cosE - ecl.z * sinE
  const z = ecl.y * sinE + ecl.z * cosE
  return { x, y, z }
}

function perihelionTime(elements: CometElements): Date | null {
  const t = new Date(elements.perihelionTimeUtc)
  if (Number.isNaN(t.getTime())) return null
  return t
}

function solveKeplerElliptic(M: number, e: number) {
  // Newton solve for E in: M = E - e sin E
  let E = e < 0.8 ? M : Math.PI
  for (let iter = 0; iter < 12; iter++) {
    const f = E - e * Math.sin(E) - M
    const fp = 1 - e * Math.cos(E)
    const dE = -f / fp
    E += dE
    if (Math.abs(dE) < 1e-12) break
  }
  return E
}

function cometHeliocentricEclipticJ2000(elements: CometElements, time: Date): { x: number; y: number; z: number; r: number } | null {
  const q = elements.perihelionDistanceAu
  const e = elements.eccentricity
  if (!(q > 0) || !(e >= 0) || !Number.isFinite(q) || !Number.isFinite(e)) return null

  const tp = perihelionTime(elements)
  if (!tp) return null

  const i = elements.inclinationDeg * DEG2RAD
  const w = elements.argPerihelionDeg * DEG2RAD
  const node = elements.ascNodeDeg * DEG2RAD

  const mu = 1.0 // AU^3/day^2 in Gaussian units, using k^2
  const k = 0.01720209895
  const k2 = k * k

  const dtDays = (time.getTime() - tp.getTime()) / 86400000

  // Parabolic & hyperbolic require different solvers. Keep v1 simple: ignore non-elliptic.
  if (e >= 1) return null

  const a = q / (1 - e) // semi-major axis AU
  const n = Math.sqrt(k2 * mu / (a * a * a)) // rad/day

  let M = n * dtDays
  // normalize to [-pi, pi] for stability
  M = ((M + Math.PI) % (2 * Math.PI)) - Math.PI

  const E = solveKeplerElliptic(M, e)
  const cosE = Math.cos(E)
  const sinE = Math.sin(E)

  const r = a * (1 - e * cosE)
  const nu = Math.atan2(Math.sqrt(1 - e * e) * sinE, cosE - e) // true anomaly

  // In orbital plane (perifocal) coordinates
  const xP = r * Math.cos(nu)
  const yP = r * Math.sin(nu)
  const zP = 0

  // Rotate to ecliptic J2000: Rz(node) * Rx(i) * Rz(w)
  const cosO = Math.cos(node)
  const sinO = Math.sin(node)
  const cosi = Math.cos(i)
  const sini = Math.sin(i)
  const cosw = Math.cos(w)
  const sinw = Math.sin(w)

  // First Rz(w)
  const x1 = xP * cosw - yP * sinw
  const y1 = xP * sinw + yP * cosw
  const z1 = zP

  // Then Rx(i)
  const x2 = x1
  const y2 = y1 * cosi - z1 * sini
  const z2 = y1 * sini + z1 * cosi

  // Then Rz(node)
  const x = x2 * cosO - y2 * sinO
  const y = x2 * sinO + y2 * cosO
  const z = z2

  return { x, y, z, r }
}

export function computeCometHorizontalPositions(
  comets: CometElements[],
  time: Date,
  location: ObserverLocation,
): CometHorizontalPosition[] {
  const out: CometHorizontalPosition[] = []

  for (const c of comets) {
    const pos = computeCometHorizontalPosition(c, time, location)
    if (pos) out.push(pos)
  }

  // Prefer comets above the horizon; keep stable ordering otherwise.
  // This is only for drawing convenience.
  return out.sort((a, b) => {
    const av = clamp01((a.altitude + 5) / 95)
    const bv = clamp01((b.altitude + 5) / 95)
    return bv - av
  })
}

export function computeCometHorizontalPosition(
  comet: CometElements,
  time: Date,
  location: ObserverLocation,
): CometHorizontalPosition | null {
  const observer = new Astronomy.Observer(location.latitude, location.longitude, 0)

  // Earth heliocentric vector in J2000 equatorial coordinates.
  const earthHelio = Astronomy.HelioVector(Astronomy.Body.Earth, time)

  // Observer geocentric vector in J2000 equatorial coordinates.
  const obsVec = Astronomy.ObserverVector(time, observer, false)

  const ecl = cometHeliocentricEclipticJ2000(comet, time)
  if (!ecl) return null

  const cometEq = rotateEclipticToEquatorialJ2000(ecl)

  // Geocentric vector: Earth -> comet
  const geo = new Astronomy.Vector(
    cometEq.x - earthHelio.x,
    cometEq.y - earthHelio.y,
    cometEq.z - earthHelio.z,
    earthHelio.t,
  )

  // Topocentric vector: observer -> comet
  const top = new Astronomy.Vector(
    geo.x - obsVec.x,
    geo.y - obsVec.y,
    geo.z - obsVec.z,
    earthHelio.t,
  )

  const eq = Astronomy.EquatorFromVector(top)
  const hor = Astronomy.Horizon(time, observer, eq.ra, eq.dec, 'normal')

  const altitude = hor.altitude
  const azimuth = hor.azimuth
  if (!Number.isFinite(altitude) || !Number.isFinite(azimuth)) return null

  const helioDistanceAu = ecl.r
  const geoDistanceAu = Math.sqrt(geo.x * geo.x + geo.y * geo.y + geo.z * geo.z)

  return {
    name: comet.name,
    packed: comet.packed,
    altitude,
    azimuth,
    helioDistanceAu,
    geoDistanceAu,
  }
}

export function estimateCometVisualWeight(pos: CometHorizontalPosition) {
  // Purely aesthetic helper for rendering.
  // Strongly boost when close to the Sun (small heliocentric distance).
  const r = Math.max(0.2, Math.min(10, pos.helioDistanceAu))
  const inv = 1 / (r * r)
  const elev = clamp01(pos.altitude / 90)
  return clamp01(0.15 + 0.6 * inv + 0.25 * elev)
}

export function sunAltAzForLocation(time: Date, location: ObserverLocation) {
  const observer = new Astronomy.Observer(location.latitude, location.longitude, 0)
  const eq = Astronomy.Equator(Astronomy.Body.Sun, time, observer, true, true)
  const hor = Astronomy.Horizon(time, observer, eq.ra, eq.dec, 'normal')
  return { altitude: hor.altitude, azimuth: hor.azimuth }
}
