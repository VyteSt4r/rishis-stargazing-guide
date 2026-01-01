import linesRaw from '../data/celestial/constellations.lines.json'
import boundsRaw from '../data/celestial/constellations.bounds.json'
import starsRaw from '../data/celestial/stars.6.json'

// Minimal GeoJSON feature collection types
interface FeatureCollection<F> {
  type: 'FeatureCollection'
  features: F[]
}

export interface ConstellationLineFeature {
  type: 'Feature'
  id: string
  properties: { rank: string }
  geometry: {
    type: 'MultiLineString'
    coordinates: number[][][] // [segment][vertex][ra, dec]
  }
}

export interface ConstellationBoundFeature {
  type: 'Feature'
  id: string
  properties: { rank: string }
  geometry: {
    type: 'Polygon'
    coordinates: number[][][] // [ring][vertex][ra, dec]
  }
}

export interface StarFeature {
  type: 'Feature'
  id: number | string
  properties: {
    mag?: number
    bv?: string
    proper?: string
    spect?: string
    [key: string]: unknown
  }
  geometry: {
    type: 'Point'
    coordinates: [number, number] // [ra, dec] degrees
  }
}

export const constellationLines = (linesRaw as FeatureCollection<ConstellationLineFeature>).features
export const constellationBounds = (boundsRaw as FeatureCollection<ConstellationBoundFeature>).features
export const starsMag6 = (starsRaw as FeatureCollection<StarFeature>).features

export const constellationBoundsById = new Map(constellationBounds.map((f) => [f.id, f]))
export const constellationLinesById = new Map(constellationLines.map((f) => [f.id, f]))

export const constellationIds = Array.from(new Set([...constellationLinesById.keys(), ...constellationBoundsById.keys()])).sort()

export function getConstellationLines(id: string) {
  return constellationLinesById.get(id)
}

export function getConstellationBounds(id: string) {
  return constellationBoundsById.get(id)
}

export function getStarsByMagnitude(maxMag: number) {
  return starsMag6.filter((f) => typeof f.properties.mag === 'number' && (f.properties.mag as number) <= maxMag)
}
