/**
 * Deep Sky Objects (DSOs) - Galaxies, Nebulae, Star Clusters
 * Data includes Messier catalog and prominent NGC objects
 */

export type DSOType = 'galaxy' | 'nebula' | 'open-cluster' | 'globular-cluster' | 'planetary-nebula'

export type DeepSkyObject = {
  id: string
  name: string
  messier?: string // M31, M42, etc.
  ngc?: string // NGC 224, etc.
  type: DSOType
  ra: number // Right ascension in degrees
  dec: number // Declination in degrees
  magnitude: number // Apparent magnitude
  size: number // Angular size in arcminutes
  description: string
  constellation: string
}

/**
 * Messier catalog + prominent NGC objects
 * Positions are J2000 epoch
 */
export const deepSkyObjects: DeepSkyObject[] = [
  // Galaxies
  {
    id: 'm31',
    name: 'Andromeda Galaxy',
    messier: 'M31',
    ngc: 'NGC 224',
    type: 'galaxy',
    ra: 10.6847,
    dec: 41.2692,
    magnitude: 3.4,
    size: 190,
    description: 'The nearest major galaxy to the Milky Way, visible to naked eye',
    constellation: 'Andromeda'
  },
  {
    id: 'm32',
    name: 'Le Gentil',
    messier: 'M32',
    ngc: 'NGC 221',
    type: 'galaxy',
    ra: 10.6742,
    dec: 40.8653,
    magnitude: 8.1,
    size: 8,
    description: 'Satellite galaxy of Andromeda',
    constellation: 'Andromeda'
  },
  {
    id: 'm110',
    name: 'Edward Young Star',
    messier: 'M110',
    ngc: 'NGC 205',
    type: 'galaxy',
    ra: 10.0950,
    dec: 41.6850,
    magnitude: 8.1,
    size: 17,
    description: 'Satellite galaxy of Andromeda',
    constellation: 'Andromeda'
  },
  {
    id: 'm33',
    name: 'Triangulum Galaxy',
    messier: 'M33',
    ngc: 'NGC 598',
    type: 'galaxy',
    ra: 23.4621,
    dec: 30.6603,
    magnitude: 5.7,
    size: 70,
    description: 'Third-largest galaxy in Local Group',
    constellation: 'Triangulum'
  },
  {
    id: 'm51',
    name: 'Whirlpool Galaxy',
    messier: 'M51',
    ngc: 'NGC 5194',
    type: 'galaxy',
    ra: 202.4696,
    dec: 47.1952,
    magnitude: 8.4,
    size: 11,
    description: 'Face-on spiral galaxy with companion',
    constellation: 'Canes Venatici'
  },
  {
    id: 'm81',
    name: "Bode's Galaxy",
    messier: 'M81',
    ngc: 'NGC 3031',
    type: 'galaxy',
    ra: 148.8883,
    dec: 69.0653,
    magnitude: 6.9,
    size: 27,
    description: 'Large spiral galaxy',
    constellation: 'Ursa Major'
  },
  {
    id: 'm82',
    name: 'Cigar Galaxy',
    messier: 'M82',
    ngc: 'NGC 3034',
    type: 'galaxy',
    ra: 148.9700,
    dec: 69.6797,
    magnitude: 8.4,
    size: 11,
    description: 'Starburst galaxy, edge-on',
    constellation: 'Ursa Major'
  },
  
  // Nebulae
  {
    id: 'm42',
    name: 'Orion Nebula',
    messier: 'M42',
    ngc: 'NGC 1976',
    type: 'nebula',
    ra: 83.8221,
    dec: -5.3911,
    magnitude: 4.0,
    size: 85,
    description: 'Brightest nebula in the sky, stellar nursery',
    constellation: 'Orion'
  },
  {
    id: 'm43',
    name: 'De Mairan\'s Nebula',
    messier: 'M43',
    ngc: 'NGC 1982',
    type: 'nebula',
    ra: 83.8792,
    dec: -5.2719,
    magnitude: 9.0,
    size: 20,
    description: 'Part of Orion Nebula complex',
    constellation: 'Orion'
  },
  {
    id: 'm8',
    name: 'Lagoon Nebula',
    messier: 'M8',
    ngc: 'NGC 6523',
    type: 'nebula',
    ra: 270.9208,
    dec: -24.3803,
    magnitude: 5.8,
    size: 90,
    description: 'Large emission nebula',
    constellation: 'Sagittarius'
  },
  {
    id: 'm16',
    name: 'Eagle Nebula',
    messier: 'M16',
    ngc: 'NGC 6611',
    type: 'nebula',
    ra: 274.7000,
    dec: -13.8000,
    magnitude: 6.0,
    size: 35,
    description: 'Contains the famous Pillars of Creation',
    constellation: 'Serpens'
  },
  {
    id: 'm17',
    name: 'Omega Nebula',
    messier: 'M17',
    ngc: 'NGC 6618',
    type: 'nebula',
    ra: 275.1875,
    dec: -16.1708,
    magnitude: 6.0,
    size: 46,
    description: 'Also called Swan Nebula',
    constellation: 'Sagittarius'
  },
  {
    id: 'm20',
    name: 'Trifid Nebula',
    messier: 'M20',
    ngc: 'NGC 6514',
    type: 'nebula',
    ra: 270.0208,
    dec: -23.0306,
    magnitude: 6.3,
    size: 28,
    description: 'Emission and reflection nebula',
    constellation: 'Sagittarius'
  },
  {
    id: 'm27',
    name: 'Dumbbell Nebula',
    messier: 'M27',
    ngc: 'NGC 6853',
    type: 'planetary-nebula',
    ra: 299.9017,
    dec: 22.7211,
    magnitude: 7.5,
    size: 8,
    description: 'Bright planetary nebula',
    constellation: 'Vulpecula'
  },
  {
    id: 'm57',
    name: 'Ring Nebula',
    messier: 'M57',
    ngc: 'NGC 6720',
    type: 'planetary-nebula',
    ra: 283.3963,
    dec: 33.0294,
    magnitude: 8.8,
    size: 1.4,
    description: 'Famous planetary nebula',
    constellation: 'Lyra'
  },
  
  // Star Clusters
  {
    id: 'm45',
    name: 'Pleiades',
    messier: 'M45',
    ngc: '',
    type: 'open-cluster',
    ra: 56.75,
    dec: 24.1167,
    magnitude: 1.6,
    size: 110,
    description: 'Seven Sisters, most famous star cluster',
    constellation: 'Taurus'
  },
  {
    id: 'm44',
    name: 'Beehive Cluster',
    messier: 'M44',
    ngc: 'NGC 2632',
    type: 'open-cluster',
    ra: 130.1000,
    dec: 19.6833,
    magnitude: 3.7,
    size: 95,
    description: 'Praesepe, visible to naked eye',
    constellation: 'Cancer'
  },
  {
    id: 'm7',
    name: 'Ptolemy Cluster',
    messier: 'M7',
    ngc: 'NGC 6475',
    type: 'open-cluster',
    ra: 268.4625,
    dec: -34.7933,
    magnitude: 3.3,
    size: 80,
    description: 'Bright open cluster',
    constellation: 'Scorpius'
  },
  {
    id: 'm13',
    name: 'Hercules Globular Cluster',
    messier: 'M13',
    ngc: 'NGC 6205',
    type: 'globular-cluster',
    ra: 250.4217,
    dec: 36.4597,
    magnitude: 5.8,
    size: 20,
    description: 'Brightest globular cluster in northern sky',
    constellation: 'Hercules'
  },
  {
    id: 'm22',
    name: 'Sagittarius Cluster',
    messier: 'M22',
    ngc: 'NGC 6656',
    type: 'globular-cluster',
    ra: 279.1042,
    dec: -23.9042,
    magnitude: 5.1,
    size: 32,
    description: 'Bright globular cluster',
    constellation: 'Sagittarius'
  },
  {
    id: 'm4',
    name: 'Cat\'s Eye',
    messier: 'M4',
    ngc: 'NGC 6121',
    type: 'globular-cluster',
    ra: 245.8967,
    dec: -26.5258,
    magnitude: 5.9,
    size: 36,
    description: 'Closest globular cluster',
    constellation: 'Scorpius'
  }
]

/**
 * Get DSO symbol/sprite based on type
 */
export function getDSOSymbol(type: DSOType): string {
  switch (type) {
    case 'galaxy':
      return '⬭' // Ellipse symbol
    case 'nebula':
      return '◈' // Diamond with cross
    case 'planetary-nebula':
      return '◎' // Circled dot
    case 'open-cluster':
      return '∴' // Therefore symbol (dots)
    case 'globular-cluster':
      return '⊕' // Circled plus
    default:
      return '○'
  }
}

/**
 * Get DSO color based on type
 */
export function getDSOColor(type: DSOType, nightMode: boolean): string {
  // Default palette is intentionally subtle/desaturated.
  // Most DSOs are visually close to grey/white to the naked eye.
  if (nightMode) {
    switch (type) {
      case 'galaxy':
        return 'rgba(235, 238, 245, 0.60)'
      case 'nebula':
        return 'rgba(225, 232, 240, 0.62)'
      case 'planetary-nebula':
        return 'rgba(230, 240, 238, 0.60)'
      case 'open-cluster':
        return 'rgba(235, 240, 255, 0.55)'
      case 'globular-cluster':
        return 'rgba(240, 240, 235, 0.58)'
    }
  } else {
    switch (type) {
      case 'galaxy':
        return 'rgba(210, 222, 245, 0.70)'
      case 'nebula':
        return 'rgba(220, 232, 245, 0.72)'
      case 'planetary-nebula':
        return 'rgba(220, 242, 238, 0.68)'
      case 'open-cluster':
        return 'rgba(220, 230, 255, 0.66)'
      case 'globular-cluster':
        return 'rgba(235, 235, 230, 0.68)'
    }
  }
}

/**
 * Per-object color: defaults to type palette, with a few subtle overrides.
 * This avoids a single neon tint being applied to every nebula/cluster.
 */
export function getDSOColorForObject(dso: DeepSkyObject, nightMode: boolean): string {
  const overrides: Record<string, { night: string; day: string }> = {
    // Nebulae (subtle; avoid neon pink/green)
    m42: { night: 'rgba(205, 228, 245, 0.65)', day: 'rgba(195, 220, 245, 0.75)' },
    m8: { night: 'rgba(230, 225, 235, 0.62)', day: 'rgba(225, 220, 235, 0.74)' },
    m20: { night: 'rgba(215, 225, 240, 0.62)', day: 'rgba(210, 222, 245, 0.74)' },
    m57: { night: 'rgba(215, 235, 235, 0.62)', day: 'rgba(210, 245, 240, 0.72)' },
    m27: { night: 'rgba(225, 238, 235, 0.62)', day: 'rgba(215, 245, 238, 0.72)' },

    // Galaxies
    m31: { night: 'rgba(230, 235, 245, 0.60)', day: 'rgba(210, 222, 245, 0.70)' },
    m33: { night: 'rgba(228, 235, 245, 0.58)', day: 'rgba(208, 222, 245, 0.68)' },

    // Clusters
    m45: { night: 'rgba(225, 238, 255, 0.58)', day: 'rgba(215, 235, 255, 0.70)' },
  }

  const override = overrides[dso.id]
  if (override) return nightMode ? override.night : override.day
  return getDSOColor(dso.type, nightMode)
}

/**
 * Get visible DSOs based on magnitude threshold
 */
export function getVisibleDSOs(maxMagnitude: number = 9.0): DeepSkyObject[] {
  return deepSkyObjects.filter(dso => dso.magnitude <= maxMagnitude)
}
