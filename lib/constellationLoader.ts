import constellationLinesData from '@/data/celestial/constellations.lines.json'

export type ConstellationFeature = {
  type: 'Feature'
  id: string
  properties: {
    rank: string
  }
  geometry: {
    type: 'MultiLineString'
    coordinates: number[][][]
  }
}

export type ConstellationLines = {
  type: 'FeatureCollection'
  features: ConstellationFeature[]
}

// Load the full constellation lines from GeoJSON
const constellations = constellationLinesData as ConstellationLines

// Map constellation IDs to full names
export const constellationNames: Record<string, string> = {
  And: 'Andromeda',
  Ant: 'Antlia',
  Aps: 'Apus',
  Aqr: 'Aquarius',
  Aql: 'Aquila',
  Ara: 'Ara',
  Ari: 'Aries',
  Aur: 'Auriga',
  Boo: 'Boötes',
  Cae: 'Caelum',
  Cam: 'Camelopardalis',
  Cnc: 'Cancer',
  CVn: 'Canes Venatici',
  CMa: 'Canis Major',
  CMi: 'Canis Minor',
  Cap: 'Capricornus',
  Car: 'Carina',
  Cas: 'Cassiopeia',
  Cen: 'Centaurus',
  Cep: 'Cepheus',
  Cet: 'Cetus',
  Cha: 'Chamaeleon',
  Cir: 'Circinus',
  Col: 'Columba',
  Com: 'Coma Berenices',
  CrA: 'Corona Australis',
  CrB: 'Corona Borealis',
  Crv: 'Corvus',
  Crt: 'Crater',
  Cru: 'Crux',
  Cyg: 'Cygnus',
  Del: 'Delphinus',
  Dor: 'Dorado',
  Dra: 'Draco',
  Equ: 'Equuleus',
  Eri: 'Eridanus',
  For: 'Fornax',
  Gem: 'Gemini',
  Gru: 'Grus',
  Her: 'Hercules',
  Hor: 'Horologium',
  Hya: 'Hydra',
  Hyi: 'Hydrus',
  Ind: 'Indus',
  Lac: 'Lacerta',
  Leo: 'Leo',
  LMi: 'Leo Minor',
  Lep: 'Lepus',
  Lib: 'Libra',
  Lup: 'Lupus',
  Lyn: 'Lynx',
  Lyr: 'Lyra',
  Men: 'Mensa',
  Mic: 'Microscopium',
  Mon: 'Monoceros',
  Mus: 'Musca',
  Nor: 'Norma',
  Oct: 'Octans',
  Oph: 'Ophiuchus',
  Ori: 'Orion',
  Pav: 'Pavo',
  Peg: 'Pegasus',
  Per: 'Perseus',
  Phe: 'Phoenix',
  Pic: 'Pictor',
  Psc: 'Pisces',
  PsA: 'Piscis Austrinus',
  Pup: 'Puppis',
  Pyx: 'Pyxis',
  Ret: 'Reticulum',
  Sge: 'Sagitta',
  Sgr: 'Sagittarius',
  Sco: 'Scorpius',
  Scl: 'Sculptor',
  Sct: 'Scutum',
  Ser: 'Serpens',
  Sex: 'Sextans',
  Tau: 'Taurus',
  Tel: 'Telescopium',
  Tri: 'Triangulum',
  TrA: 'Triangulum Australe',
  Tuc: 'Tucana',
  UMa: 'Ursa Major',
  UMi: 'Ursa Minor',
  Vel: 'Vela',
  Vir: 'Virgo',
  Vol: 'Volans',
  Vul: 'Vulpecula'
}

export function getAllConstellations(): ConstellationFeature[] {
  return constellations.features
}

export function getConstellationByName(name: string): ConstellationFeature | undefined {
  return constellations.features.find(
    (f) => f.id === name || constellationNames[f.id]?.toLowerCase() === name.toLowerCase()
  )
}

// Get prominent constellations (rank 1)
export function getProminentConstellations(): ConstellationFeature[] {
  return constellations.features.filter((f) => f.properties.rank === '1')
}

// Get constellation line segments for rendering
export type ConstellationLineSegment = {
  id: string
  name: string
  rank: string
  lines: Array<{
    points: Array<{ lon: number; lat: number }>
  }>
}

export function getConstellationLineSegments(): ConstellationLineSegment[] {
  return constellations.features.map((feature) => ({
    id: feature.id,
    name: constellationNames[feature.id] || feature.id,
    rank: feature.properties.rank,
    lines: feature.geometry.coordinates.map((lineCoords) => ({
      points: lineCoords.map(([lon, lat]) => ({
        lon,
        lat
      }))
    }))
  }))
}

// Get constellation label position (centroid of first line)
export function getConstellationLabelPosition(feature: ConstellationFeature): { lon: number; lat: number } | null {
  if (feature.geometry.coordinates.length === 0 || feature.geometry.coordinates[0].length === 0) {
    return null
  }
  
  // Use the first point of the first line as the label position
  const [lon, lat] = feature.geometry.coordinates[0][0]
  return { lon, lat }
}
