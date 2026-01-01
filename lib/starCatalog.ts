export type StarRecord = {
  id: string | number
  name?: string
  ra: number // degrees
  dec: number // degrees
  mag: number
  bv: number // color index
  constellation?: string
}

let fullCatalogCache: StarRecord[] | null = null;

// Load the full star catalog from stars.6.json
export async function loadFullStarCatalog(maxMagnitude: number = 6.0): Promise<StarRecord[]> {
  if (fullCatalogCache !== null) {
    return fullCatalogCache.filter(star => star.mag <= maxMagnitude);
  }

  try {
    // Import the JSON file directly instead of fetching
    const starsModule = await import('@/data/celestial/stars.6.json');
    const geojson = starsModule.default;
    
    const stars: StarRecord[] = geojson.features
      .map((feature: any) => {
        const [lon, lat] = feature.geometry.coordinates;
        // Convert longitude (-180 to 180) to RA (0 to 360)
        let ra = lon;
        if (ra < 0) ra += 360;
        
        return {
          id: feature.id,
          ra,
          dec: lat,
          mag: feature.properties.mag,
          bv: feature.properties.bv || 0
        };
      });
    
    fullCatalogCache = stars;
    console.log(`Loaded ${stars.length} total stars from catalog`);
    
    return stars.filter(star => star.mag <= maxMagnitude);
  } catch (error) {
    console.error('Error loading star catalog:', error);
    return [];
  }
}

// Get star color based on B-V color index (realistic astronomical colors)
export function getStarColorFromBV(bv: number): string {
  // B-V color index to RGB mapping (astronomical accurate)
  if (bv < -0.3) return '#9bb0ff'; // Blue-white O-type (very hot)
  if (bv < -0.02) return '#aabfff'; // Blue-white B-type (hot)
  if (bv < 0.3) return '#cad7ff';   // White A-type
  if (bv < 0.6) return '#fbf8ff';   // Yellow-white F-type
  if (bv < 0.82) return '#fff4e8';  // Yellow G-type (like our Sun)
  if (bv < 1.4) return '#ffd2a1';   // Orange K-type
  return '#ffcc6f';                  // Red M-type (cool)
}

// Get star size multiplier based on magnitude
export function getStarSize(magnitude: number): number {
  // Brighter stars (lower magnitude) = larger size
  // Magnitude scale: -1 (very bright) to 6 (barely visible)
  if (magnitude < -0.5) return 8;  // Sirius, Canopus level
  if (magnitude < 0) return 7;
  if (magnitude < 0.5) return 6;
  if (magnitude < 1) return 5;
  if (magnitude < 1.5) return 4;
  if (magnitude < 2) return 3.5;
  if (magnitude < 3) return 3;
  if (magnitude < 4) return 2.5;
  if (magnitude < 5) return 2;
  return 1.5;
}

// Should star have glow effect?
export function shouldStarGlow(magnitude: number): boolean {
  return magnitude < 2; // Only bright stars get glow
}

// Get star alpha (transparency) based on magnitude
export function getStarAlpha(magnitude: number): number {
  if (magnitude < 2) return 1.0;
  if (magnitude < 3) return 0.9;
  if (magnitude < 4) return 0.8;
  if (magnitude < 5) return 0.7;
  return 0.6;
}

// Bright-star subset (mag ~5.5 and brighter) covering major constellations.
// This keeps payload light while providing full-sky coverage for rendering.
export const starCatalog: StarRecord[] = [
  // Orion
  { id: 'betelgeuse', name: 'Betelgeuse', ra: 88.7929, dec: 7.4071, mag: 0.50, bv: 1.85, constellation: 'Orion' },
  { id: 'rigel', name: 'Rigel', ra: 78.6345, dec: -8.2016, mag: 0.18, bv: -0.03, constellation: 'Orion' },
  { id: 'bellatrix', name: 'Bellatrix', ra: 81.2828, dec: 6.3497, mag: 1.64, bv: -0.22, constellation: 'Orion' },
  { id: 'saiph', name: 'Saiph', ra: 86.9391, dec: -9.6696, mag: 2.07, bv: -0.24, constellation: 'Orion' },
  { id: 'alnitak', name: 'Alnitak', ra: 85.1897, dec: -1.9426, mag: 1.74, bv: -0.20, constellation: 'Orion' },
  { id: 'alnilam', name: 'Alnilam', ra: 84.0534, dec: -1.2019, mag: 1.69, bv: -0.20, constellation: 'Orion' },
  { id: 'mintaka', name: 'Mintaka', ra: 83.0017, dec: -0.2991, mag: 2.23, bv: -0.20, constellation: 'Orion' },
  { id: 'meissa', name: 'Meissa', ra: 88.7930, dec: 9.9342, mag: 3.54, bv: -0.21, constellation: 'Orion' },

  // Ursa Major (Big Dipper)
  { id: 'dubhe', name: 'Dubhe', ra: 165.9322, dec: 61.7510, mag: 1.79, bv: 1.07, constellation: 'Ursa Major' },
  { id: 'merak', name: 'Merak', ra: 165.4600, dec: 56.3824, mag: 2.37, bv: 0.33, constellation: 'Ursa Major' },
  { id: 'phecda', name: 'Phecda', ra: 178.4570, dec: 53.6948, mag: 2.44, bv: 0.02, constellation: 'Ursa Major' },
  { id: 'megrez', name: 'Megrez', ra: 183.8560, dec: 57.0326, mag: 3.32, bv: 0.01, constellation: 'Ursa Major' },
  { id: 'alioth', name: 'Alioth', ra: 193.5073, dec: 55.9598, mag: 1.76, bv: 0.00, constellation: 'Ursa Major' },
  { id: 'mizar', name: 'Mizar', ra: 200.9814, dec: 54.9254, mag: 2.23, bv: 0.03, constellation: 'Ursa Major' },
  { id: 'alkaid', name: 'Alkaid', ra: 206.8857, dec: 49.3143, mag: 1.86, bv: -0.01, constellation: 'Ursa Major' },

  // Taurus and Pleiades
  { id: 'aldebaran', name: 'Aldebaran', ra: 68.9800, dec: 16.5093, mag: 0.86, bv: 1.54, constellation: 'Taurus' },
  { id: 'alcyone', name: 'Alcyone', ra: 56.7500, dec: 24.1167, mag: 2.85, bv: -0.08, constellation: 'Taurus' },
  { id: 'atlas', name: 'Atlas', ra: 56.2188, dec: 24.0534, mag: 3.62, bv: -0.01, constellation: 'Taurus' },
  { id: 'electra', name: 'Electra', ra: 56.2189, dec: 24.1133, mag: 3.70, bv: -0.04, constellation: 'Taurus' },
  { id: 'maia', name: 'Maia', ra: 56.3826, dec: 24.1367, mag: 3.87, bv: -0.03, constellation: 'Taurus' },
  { id: 'merope', name: 'Merope', ra: 56.6312, dec: 23.9483, mag: 4.14, bv: -0.06, constellation: 'Taurus' },
  { id: 'taygeta', name: 'Taygeta', ra: 56.4567, dec: 24.3675, mag: 4.30, bv: -0.05, constellation: 'Taurus' },
  { id: 'pleione', name: 'Pleione', ra: 56.7540, dec: 24.1143, mag: 5.09, bv: 0.15, constellation: 'Taurus' },

  // Summer Triangle + bright stars
  { id: 'vega', name: 'Vega', ra: 279.2347, dec: 38.7837, mag: 0.03, bv: 0.00, constellation: 'Lyra' },
  { id: 'deneb', name: 'Deneb', ra: 310.3579, dec: 45.2803, mag: 1.25, bv: 0.09, constellation: 'Cygnus' },
  { id: 'altair', name: 'Altair', ra: 297.6958, dec: 8.8683, mag: 0.77, bv: 0.22, constellation: 'Aquila' },
  { id: 'arcturus', name: 'Arcturus', ra: 213.9153, dec: 19.1825, mag: -0.05, bv: 1.23, constellation: 'Boötes' },
  { id: 'spica', name: 'Spica', ra: 201.2983, dec: -11.1614, mag: 1.04, bv: -0.23, constellation: 'Virgo' },
  { id: 'regulus', name: 'Regulus', ra: 152.0929, dec: 11.9672, mag: 1.35, bv: -0.11, constellation: 'Leo' },
  { id: 'pollux', name: 'Pollux', ra: 116.3297, dec: 28.0262, mag: 1.14, bv: 1.00, constellation: 'Gemini' },
  { id: 'castor', name: 'Castor', ra: 113.6494, dec: 31.8883, mag: 1.59, bv: 0.00, constellation: 'Gemini' },
  { id: 'capella', name: 'Capella', ra: 79.1723, dec: 45.9979, mag: 0.08, bv: 0.80, constellation: 'Auriga' },
  { id: 'procyon', name: 'Procyon', ra: 114.8255, dec: 5.2250, mag: 0.38, bv: 0.42, constellation: 'Canis Minor' },
  { id: 'sirius', name: 'Sirius', ra: 101.2875, dec: -16.7161, mag: -1.46, bv: 0.00, constellation: 'Canis Major' },
  { id: 'canopus', name: 'Canopus', ra: 95.9879, dec: -52.6957, mag: -0.74, bv: 0.15, constellation: 'Carina' },
  { id: 'rigel_kent', name: 'Rigil Kentaurus', ra: 219.9021, dec: -60.8339, mag: -0.01, bv: 0.71, constellation: 'Centaurus' },
  { id: 'antares', name: 'Antares', ra: 247.3519, dec: -26.4320, mag: 1.06, bv: 1.83, constellation: 'Scorpius' },
  { id: 'acrux', name: 'Acrux', ra: 186.6496, dec: -63.0991, mag: 0.76, bv: -0.24, constellation: 'Crux' },
  { id: 'miaplacidus', name: 'Miaplacidus', ra: 138.2997, dec: -69.7172, mag: 1.67, bv: -0.07, constellation: 'Carina' },
  { id: 'fomalhaut', name: 'Fomalhaut', ra: 344.4128, dec: -29.6222, mag: 1.16, bv: 0.09, constellation: 'Piscis Austrinus' },
  { id: 'achernar', name: 'Achernar', ra: 24.4286, dec: -57.2368, mag: 0.46, bv: -0.16, constellation: 'Eridanus' },
  { id: 'altarf', name: 'Al Tarf', ra: 131.6943, dec: 18.1543, mag: 3.53, bv: 1.50, constellation: 'Cancer' },
  { id: 'denebola', name: 'Denebola', ra: 177.2649, dec: 14.5721, mag: 2.14, bv: 0.08, constellation: 'Leo' },
  { id: 'algol', name: 'Algol', ra: 47.0422, dec: 40.9556, mag: 2.12, bv: -0.02, constellation: 'Perseus' },
  { id: 'mirfak', name: 'Mirfak', ra: 51.0807, dec: 49.8612, mag: 1.79, bv: 0.37, constellation: 'Perseus' },
  { id: 'aldebaran2', name: 'Elnath', ra: 81.5729, dec: 28.6075, mag: 1.65, bv: -0.12, constellation: 'Taurus' },
  { id: 'kochab', name: 'Kochab', ra: 222.6764, dec: 74.1555, mag: 2.08, bv: 1.16, constellation: 'Ursa Minor' },
  { id: 'polaris', name: 'Polaris', ra: 37.9546, dec: 89.2641, mag: 1.98, bv: 0.60, constellation: 'Ursa Minor' },

  // Cassiopeia
  { id: 'schedar', name: 'Schedar', ra: 10.127, dec: 56.537, mag: 2.24, bv: 1.17, constellation: 'Cassiopeia' },
  { id: 'caph', name: 'Caph', ra: 2.295, dec: 59.150, mag: 2.28, bv: 0.34, constellation: 'Cassiopeia' },
  { id: 'cih', name: 'Cih', ra: 14.177, dec: 60.717, mag: 2.47, bv: -0.15, constellation: 'Cassiopeia' },
  { id: 'ruchbah', name: 'Ruchbah', ra: 20.182, dec: 60.235, mag: 2.68, bv: 0.08, constellation: 'Cassiopeia' },
  { id: 'segin', name: 'Segin', ra: 25.920, dec: 63.670, mag: 3.35, bv: -0.15, constellation: 'Cassiopeia' },
  
  // Cygnus (more stars)
  { id: 'sadr', name: 'Sadr', ra: 305.557, dec: 40.257, mag: 2.23, bv: 0.67, constellation: 'Cygnus' },
  { id: 'gienah', name: 'Gienah', ra: 304.033, dec: 33.970, mag: 2.48, bv: 1.03, constellation: 'Cygnus' },
  
  // Aquila (more stars)
  { id: 'tarazed', name: 'Tarazed', ra: 296.565, dec: 10.613, mag: 2.72, bv: 1.15, constellation: 'Aquila' },
  { id: 'alshain', name: 'Alshain', ra: 298.828, dec: 6.407, mag: 3.71, bv: 0.26, constellation: 'Aquila' },
  
  // Andromeda
  { id: 'alpheratz', name: 'Alpheratz', ra: 2.097, dec: 29.090, mag: 2.07, bv: -0.11, constellation: 'Andromeda' },
  { id: 'mirach', name: 'Mirach', ra: 17.433, dec: 35.620, mag: 2.07, bv: 1.57, constellation: 'Andromeda' },
  { id: 'almach', name: 'Almach', ra: 30.975, dec: 42.330, mag: 2.10, bv: 1.37, constellation: 'Andromeda' },
  
  // Pegasus
  { id: 'markab', name: 'Markab', ra: 346.190, dec: 15.205, mag: 2.49, bv: -0.04, constellation: 'Pegasus' },
  { id: 'scheat', name: 'Scheat', ra: 345.943, dec: 28.083, mag: 2.44, bv: 1.57, constellation: 'Pegasus' },
  { id: 'algenib', name: 'Algenib', ra: 3.309, dec: 15.183, mag: 2.84, bv: -0.10, constellation: 'Pegasus' },
  
  // Lyra (more stars)
  { id: 'sheliak', name: 'Sheliak', ra: 282.520, dec: 33.363, mag: 3.52, bv: -0.07, constellation: 'Lyra' },
  { id: 'sulafat', name: 'Sulafat', ra: 284.736, dec: 32.690, mag: 3.25, bv: 0.00, constellation: 'Lyra' },
  
  // Scorpius (more stars)
  { id: 'shaula', name: 'Shaula', ra: 263.402, dec: -37.104, mag: 1.62, bv: -0.22, constellation: 'Scorpius' },
  { id: 'sargas', name: 'Sargas', ra: 265.622, dec: -42.998, mag: 1.86, bv: 0.27, constellation: 'Scorpius' },
  
  // Sagittarius
  { id: 'kaus-australis', name: 'Kaus Australis', ra: 276.993, dec: -34.385, mag: 1.79, bv: -0.04, constellation: 'Sagittarius' },
  { id: 'nunki', name: 'Nunki', ra: 283.816, dec: -26.297, mag: 2.05, bv: -0.20, constellation: 'Sagittarius' },
  { id: 'ascella', name: 'Ascella', ra: 287.440, dec: -29.828, mag: 2.60, bv: 0.02, constellation: 'Sagittarius' }
]
