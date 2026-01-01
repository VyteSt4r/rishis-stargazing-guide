export type ConstellationStar = {
  id: string
  name: string
  ra: number // Right ascension in degrees
  dec: number // Declination in degrees
  mag: number
  constellation: string
}

export type ConstellationLine = {
  from: string
  to: string
  constellation: string
}

export const constellationStars: ConstellationStar[] = [
  // Orion
  { id: 'betelgeuse', name: 'Betelgeuse', ra: 88.7929, dec: 7.4071, mag: 0.50, constellation: 'Orion' },
  { id: 'rigel', name: 'Rigel', ra: 78.6345, dec: -8.2016, mag: 0.18, constellation: 'Orion' },
  { id: 'bellatrix', name: 'Bellatrix', ra: 81.2828, dec: 6.3497, mag: 1.64, constellation: 'Orion' },
  { id: 'saiph', name: 'Saiph', ra: 86.9391, dec: -9.6696, mag: 2.07, constellation: 'Orion' },
  { id: 'alnitak', name: 'Alnitak', ra: 85.1897, dec: -1.9426, mag: 1.74, constellation: 'Orion' },
  { id: 'alnilam', name: 'Alnilam', ra: 84.0534, dec: -1.2019, mag: 1.69, constellation: 'Orion' },
  { id: 'mintaka', name: 'Mintaka', ra: 83.0017, dec: -0.2991, mag: 2.23, constellation: 'Orion' },
  { id: 'meissa', name: 'Meissa', ra: 88.7930, dec: 9.9342, mag: 3.54, constellation: 'Orion' },

  // Ursa Major (Big Dipper asterism)
  { id: 'dubhe', name: 'Dubhe', ra: 165.9322, dec: 61.7510, mag: 1.79, constellation: 'Ursa Major' },
  { id: 'merak', name: 'Merak', ra: 165.4600, dec: 56.3824, mag: 2.37, constellation: 'Ursa Major' },
  { id: 'phecda', name: 'Phecda', ra: 178.4570, dec: 53.6948, mag: 2.44, constellation: 'Ursa Major' },
  { id: 'megrez', name: 'Megrez', ra: 183.8560, dec: 57.0326, mag: 3.32, constellation: 'Ursa Major' },
  { id: 'alioth', name: 'Alioth', ra: 193.5073, dec: 55.9598, mag: 1.76, constellation: 'Ursa Major' },
  { id: 'mizar', name: 'Mizar', ra: 200.9814, dec: 54.9254, mag: 2.23, constellation: 'Ursa Major' },
  { id: 'alkaid', name: 'Alkaid', ra: 206.8857, dec: 49.3143, mag: 1.86, constellation: 'Ursa Major' },

  // Pleiades (Taurus)
  { id: 'alcyone', name: 'Alcyone', ra: 56.7500, dec: 24.1167, mag: 2.85, constellation: 'Taurus' },
  { id: 'atlas', name: 'Atlas', ra: 56.2188, dec: 24.0534, mag: 3.62, constellation: 'Taurus' },
  { id: 'electra', name: 'Electra', ra: 56.2189, dec: 24.1133, mag: 3.70, constellation: 'Taurus' },
  { id: 'maia', name: 'Maia', ra: 56.3826, dec: 24.1367, mag: 3.87, constellation: 'Taurus' },
  { id: 'merope', name: 'Merope', ra: 56.6312, dec: 23.9483, mag: 4.14, constellation: 'Taurus' },
  { id: 'taygeta', name: 'Taygeta', ra: 56.4567, dec: 24.3675, mag: 4.30, constellation: 'Taurus' },
  { id: 'pleione', name: 'Pleione', ra: 56.7540, dec: 24.1143, mag: 5.09, constellation: 'Taurus' }
]

// Add more stars for additional constellations
constellationStars.push(
  // Cassiopeia
  { id: 'schedar', name: 'Schedar', ra: 10.127, dec: 56.537, mag: 2.24, constellation: 'Cassiopeia' },
  { id: 'caph', name: 'Caph', ra: 2.295, dec: 59.150, mag: 2.28, constellation: 'Cassiopeia' },
  { id: 'cih', name: 'Cih', ra: 14.177, dec: 60.717, mag: 2.47, constellation: 'Cassiopeia' },
  { id: 'ruchbah', name: 'Ruchbah', ra: 20.182, dec: 60.235, mag: 2.68, constellation: 'Cassiopeia' },
  { id: 'segin', name: 'Segin', ra: 25.920, dec: 63.670, mag: 3.35, constellation: 'Cassiopeia' },
  
  // Cygnus (body)
  { id: 'deneb', name: 'Deneb', ra: 310.358, dec: 45.280, mag: 1.25, constellation: 'Cygnus' },
  { id: 'sadr', name: 'Sadr', ra: 305.557, dec: 40.257, mag: 2.23, constellation: 'Cygnus' },
  { id: 'gienah', name: 'Gienah', ra: 304.033, dec: 33.970, mag: 2.48, constellation: 'Cygnus' },
  
  // Aquila (body)
  { id: 'altair', name: 'Altair', ra: 297.696, dec: 8.868, mag: 0.76, constellation: 'Aquila' },
  { id: 'tarazed', name: 'Tarazed', ra: 296.565, dec: 10.613, mag: 2.72, constellation: 'Aquila' },
  { id: 'alshain', name: 'Alshain', ra: 298.828, dec: 6.407, mag: 3.71, constellation: 'Aquila' },
  
  // Andromeda
  { id: 'alpheratz', name: 'Alpheratz', ra: 2.097, dec: 29.090, mag: 2.07, constellation: 'Andromeda' },
  { id: 'mirach', name: 'Mirach', ra: 17.433, dec: 35.620, mag: 2.07, constellation: 'Andromeda' },
  { id: 'almach', name: 'Almach', ra: 30.975, dec: 42.330, mag: 2.10, constellation: 'Andromeda' },
  
  // Perseus
  { id: 'mirfak', name: 'Mirfak', ra: 51.080, dec: 49.861, mag: 1.79, constellation: 'Perseus' },
  { id: 'algol', name: 'Algol', ra: 47.042, dec: 40.955, mag: 2.09, constellation: 'Perseus' },
  
  // Pegasus (Square)
  { id: 'markab', name: 'Markab', ra: 346.190, dec: 15.205, mag: 2.49, constellation: 'Pegasus' },
  { id: 'scheat', name: 'Scheat', ra: 345.943, dec: 28.083, mag: 2.44, constellation: 'Pegasus' },
  { id: 'algenib', name: 'Algenib', ra: 3.309, dec: 15.183, mag: 2.84, constellation: 'Pegasus' },
  
  // Lyra
  { id: 'vega', name: 'Vega', ra: 279.235, dec: 38.783, mag: 0.03, constellation: 'Lyra' },
  { id: 'sheliak', name: 'Sheliak', ra: 282.520, dec: 33.363, mag: 3.52, constellation: 'Lyra' },
  { id: 'sulafat', name: 'Sulafat', ra: 284.736, dec: 32.690, mag: 3.25, constellation: 'Lyra' },
  
  // Scorpius
  { id: 'antares', name: 'Antares', ra: 247.352, dec: -26.432, mag: 1.06, constellation: 'Scorpius' },
  { id: 'shaula', name: 'Shaula', ra: 263.402, dec: -37.104, mag: 1.62, constellation: 'Scorpius' },
  { id: 'sargas', name: 'Sargas', ra: 265.622, dec: -42.998, mag: 1.86, constellation: 'Scorpius' },
  
  // Sagittarius
  { id: 'kaus-australis', name: 'Kaus Australis', ra: 276.993, dec: -34.385, mag: 1.79, constellation: 'Sagittarius' },
  { id: 'nunki', name: 'Nunki', ra: 283.816, dec: -26.297, mag: 2.05, constellation: 'Sagittarius' },
  { id: 'ascella', name: 'Ascella', ra: 287.440, dec: -29.828, mag: 2.60, constellation: 'Sagittarius' }
)

export const constellationLines: ConstellationLine[] = [
  // Orion lines
  { from: 'betelgeuse', to: 'bellatrix', constellation: 'Orion' },
  { from: 'bellatrix', to: 'mintaka', constellation: 'Orion' },
  { from: 'mintaka', to: 'alnilam', constellation: 'Orion' },
  { from: 'alnilam', to: 'alnitak', constellation: 'Orion' },
  { from: 'alnitak', to: 'saiph', constellation: 'Orion' },
  { from: 'saiph', to: 'rigel', constellation: 'Orion' },
  { from: 'rigel', to: 'bellatrix', constellation: 'Orion' },
  { from: 'betelgeuse', to: 'alnilam', constellation: 'Orion' },
  { from: 'betelgeuse', to: 'meissa', constellation: 'Orion' },
  { from: 'meissa', to: 'bellatrix', constellation: 'Orion' },

  // Ursa Major (Big Dipper bowl + handle)
  { from: 'dubhe', to: 'merak', constellation: 'Ursa Major' },
  { from: 'merak', to: 'phecda', constellation: 'Ursa Major' },
  { from: 'phecda', to: 'megrez', constellation: 'Ursa Major' },
  { from: 'megrez', to: 'alioth', constellation: 'Ursa Major' },
  { from: 'alioth', to: 'mizar', constellation: 'Ursa Major' },
  { from: 'mizar', to: 'alkaid', constellation: 'Ursa Major' },
  { from: 'megrez', to: 'dubhe', constellation: 'Ursa Major' },
  { from: 'phecda', to: 'dubhe', constellation: 'Ursa Major' },

  // Pleiades cluster - tighter pattern
  { from: 'atlas', to: 'alcyone', constellation: 'Taurus' },
  { from: 'alcyone', to: 'electra', constellation: 'Taurus' },
  { from: 'alcyone', to: 'maia', constellation: 'Taurus' },
  { from: 'alcyone', to: 'merope', constellation: 'Taurus' },
  { from: 'alcyone', to: 'taygeta', constellation: 'Taurus' },

  // Summer Triangle
  { from: 'vega', to: 'deneb', constellation: 'Lyra' },
  { from: 'deneb', to: 'altair', constellation: 'Cygnus' },
  { from: 'altair', to: 'vega', constellation: 'Aquila' },

  // Leo
  { from: 'regulus', to: 'denebola', constellation: 'Leo' },

  // Gemini
  { from: 'castor', to: 'pollux', constellation: 'Gemini' },

  // Taurus main body
  { from: 'aldebaran', to: 'alcyone', constellation: 'Taurus' },
  
  // Cassiopeia W-shape
  { from: 'segin', to: 'ruchbah', constellation: 'Cassiopeia' },
  { from: 'ruchbah', to: 'cih', constellation: 'Cassiopeia' },
  { from: 'cih', to: 'schedar', constellation: 'Cassiopeia' },
  { from: 'schedar', to: 'caph', constellation: 'Cassiopeia' },
  
  // Cygnus (Northern Cross)
  { from: 'deneb', to: 'sadr', constellation: 'Cygnus' },
  { from: 'sadr', to: 'gienah', constellation: 'Cygnus' },
  
  // Aquila
  { from: 'tarazed', to: 'altair', constellation: 'Aquila' },
  { from: 'altair', to: 'alshain', constellation: 'Aquila' },
  
  // Andromeda
  { from: 'alpheratz', to: 'mirach', constellation: 'Andromeda' },
  { from: 'mirach', to: 'almach', constellation: 'Andromeda' },
  
  // Perseus
  { from: 'mirfak', to: 'algol', constellation: 'Perseus' },
  
  // Pegasus Square
  { from: 'markab', to: 'scheat', constellation: 'Pegasus' },
  { from: 'scheat', to: 'alpheratz', constellation: 'Pegasus' },
  { from: 'alpheratz', to: 'algenib', constellation: 'Pegasus' },
  { from: 'algenib', to: 'markab', constellation: 'Pegasus' },
  
  // Lyra
  { from: 'vega', to: 'sheliak', constellation: 'Lyra' },
  { from: 'sheliak', to: 'sulafat', constellation: 'Lyra' },
  
  // Scorpius
  { from: 'antares', to: 'shaula', constellation: 'Scorpius' },
  { from: 'shaula', to: 'sargas', constellation: 'Scorpius' },
  
  // Sagittarius (Teapot asterism)
  { from: 'kaus-australis', to: 'nunki', constellation: 'Sagittarius' },
  { from: 'nunki', to: 'ascella', constellation: 'Sagittarius' }
]
