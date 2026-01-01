import * as Astronomy from 'astronomy-engine';

export interface ObserverLocation {
  latitude: number;
  longitude: number;
  elevation?: number;
}

export interface HorizontalCoordinates {
  altitude: number;
  azimuth: number;
}

export interface EquatorialCoordinates {
  ra: number; // Right Ascension in degrees
  dec: number; // Declination in degrees
}

export interface CelestialBody {
  name: string;
  position: { x: number; y: number; z: number };
  magnitude: number;
  color: string;
  type: 'star' | 'planet' | 'satellite' | 'dso';
}

export type PlanetHorizontalPosition = {
  name: string;
  altitude: number;
  azimuth: number;
  magnitude: number;
  color: string;
  distanceAu: number;
  angularDiameterDeg: number;
  ringTiltDeg?: number;
};

export type JovianMoonHorizontalPosition = {
  name: 'Io' | 'Europa' | 'Ganymede' | 'Callisto';
  altitude: number;
  azimuth: number;
};

const AU_KM = 149_597_870.7;

const BODY_RADIUS_KM: Record<string, number> = {
  Sun: 696_340,
  Moon: 1_737.4,
  Mercury: 2_439.7,
  Venus: 6_051.8,
  Mars: 3_389.5,
  Jupiter: 69_911,
  Saturn: 58_232,
  Uranus: 25_362,
  Neptune: 24_622,
  Pluto: 1_188.3,
};

function angularDiameterDeg(radiusKm: number, distanceAu: number): number {
  const dKm = Math.max(1e-9, distanceAu * AU_KM);
  const angRad = 2 * Math.atan2(radiusKm, dKm);
  return (angRad * 180) / Math.PI;
}

// Bangalore default coordinates
export const BANGALORE_LOCATION: ObserverLocation = {
  latitude: 12.9716,
  longitude: 77.5946,
  elevation: 920
};

/**
 * Convert Equatorial coordinates (RA/Dec) to Horizontal coordinates (Alt/Az)
 * Using proper astronomical formulas with observer location and time
 */
export function equatorialToHorizontal(
  eq: EquatorialCoordinates,
  location: ObserverLocation,
  time: Date
): HorizontalCoordinates {
  const observer = new Astronomy.Observer(location.latitude, location.longitude, location.elevation || 0);
  
  // Convert RA from degrees to hours (RA is typically in hours in astronomy-engine)
  const raHours = eq.ra / 15;
  
  // Convert to horizontal coordinates
  const hor = Astronomy.Horizon(time, observer, raHours, eq.dec, 'normal');
  
  return {
    altitude: hor.altitude,
    azimuth: hor.azimuth
  };
}

/**
 * Convert Horizontal coordinates (Alt/Az) to 3D Cartesian coordinates
 * for rendering in Three.js (hemisphere projection)
 */
export function horizontalToCartesian(
  altitude: number,
  azimuth: number,
  radius: number = 1000
): { x: number; y: number; z: number } {
  // Convert to radians
  const altRad = (altitude * Math.PI) / 180;
  const azRad = (azimuth * Math.PI) / 180;
  
  // Spherical to Cartesian conversion
  // In Three.js: Y is up, X is right, Z is forward
  const r = radius * Math.cos(altRad);
  
  return {
    x: r * Math.sin(azRad),
    y: radius * Math.sin(altRad),
    z: -r * Math.cos(azRad) // Negative Z for North
  };
}

/**
 * Get current positions of all major planets
 */
export function getPlanetPositions(time: Date, observer: ObserverLocation): CelestialBody[] {
  const planets: Array<{ name: string; body: Astronomy.Body; color: string }> = [
    { name: 'Mercury', body: Astronomy.Body.Mercury, color: '#B8B8B8' },
    { name: 'Venus', body: Astronomy.Body.Venus, color: '#FFC649' },
    { name: 'Mars', body: Astronomy.Body.Mars, color: '#E27B58' },
    { name: 'Jupiter', body: Astronomy.Body.Jupiter, color: '#C88B3A' },
    { name: 'Saturn', body: Astronomy.Body.Saturn, color: '#FAD5A5' },
    { name: 'Uranus', body: Astronomy.Body.Uranus, color: '#4FD0E7' },
    { name: 'Neptune', body: Astronomy.Body.Neptune, color: '#4166F5' },
    { name: 'Pluto', body: Astronomy.Body.Pluto, color: '#C7B7A3' }
  ];
  
  const obs = new Astronomy.Observer(observer.latitude, observer.longitude, observer.elevation || 0);
  const result: CelestialBody[] = [];
  
  for (const planet of planets) {
    try {
      const equ = Astronomy.Equator(planet.body, time, obs, true, true);
      const hor = Astronomy.Horizon(time, obs, equ.ra, equ.dec, 'normal');
      
      if (hor.altitude > 0) {
        const pos = horizontalToCartesian(hor.altitude, hor.azimuth);
        
        result.push({
          name: planet.name,
          position: pos,
          magnitude: Astronomy.Illumination(planet.body, time).mag,
          color: planet.color,
          type: 'planet'
        });
      }
    } catch (e) {
      console.warn(`Error calculating ${planet.name}:`, e);
    }
  }
  
  return result;
}

/**
 * Get planet positions in horizontal coordinates (Alt/Az)
 * Includes Pluto.
 */
export function getPlanetHorizontalPositions(time: Date, observer: ObserverLocation): PlanetHorizontalPosition[] {
  const planets: Array<{ name: string; body: Astronomy.Body; color: string }> = [
    { name: 'Mercury', body: Astronomy.Body.Mercury, color: '#B8B8B8' },
    { name: 'Venus', body: Astronomy.Body.Venus, color: '#FFC649' },
    { name: 'Mars', body: Astronomy.Body.Mars, color: '#E27B58' },
    { name: 'Jupiter', body: Astronomy.Body.Jupiter, color: '#C88B3A' },
    { name: 'Saturn', body: Astronomy.Body.Saturn, color: '#FAD5A5' },
    { name: 'Uranus', body: Astronomy.Body.Uranus, color: '#4FD0E7' },
    { name: 'Neptune', body: Astronomy.Body.Neptune, color: '#4166F5' },
    { name: 'Pluto', body: Astronomy.Body.Pluto, color: '#C7B7A3' }
  ];

  const obs = new Astronomy.Observer(observer.latitude, observer.longitude, observer.elevation || 0);
  const result: PlanetHorizontalPosition[] = [];

  for (const planet of planets) {
    try {
      const equ = Astronomy.Equator(planet.body, time, obs, true, true);
      const hor = Astronomy.Horizon(time, obs, equ.ra, equ.dec, 'normal');

      const distanceAu = equ.dist;
      const rKm = BODY_RADIUS_KM[planet.name] ?? 0;
      const angDeg = rKm > 0 ? angularDiameterDeg(rKm, distanceAu) : 0;

      const illum = Astronomy.Illumination(planet.body, time);
      result.push({
        name: planet.name,
        altitude: hor.altitude,
        azimuth: hor.azimuth,
        magnitude: illum.mag,
        color: planet.color,
        distanceAu,
        angularDiameterDeg: angDeg,
        ringTiltDeg: illum.ring_tilt,
      });
    } catch (e) {
      console.warn(`Error calculating ${planet.name}:`, e);
    }
  }

  return result;
}

/**
 * Get Sun position and calculate atmospheric color
 */
export function getSunPosition(time: Date, observer: ObserverLocation) {
  const obs = new Astronomy.Observer(observer.latitude, observer.longitude, observer.elevation || 0);
  const equ = Astronomy.Equator(Astronomy.Body.Sun, time, obs, true, true);
  const hor = Astronomy.Horizon(time, obs, equ.ra, equ.dec, 'normal');
  
  return {
    altitude: hor.altitude,
    azimuth: hor.azimuth,
    position: horizontalToCartesian(hor.altitude, hor.azimuth),
    distanceAu: equ.dist,
    angularDiameterDeg: angularDiameterDeg(BODY_RADIUS_KM.Sun, equ.dist),
  };
}

/**
 * Get Moon position and phase
 */
export function getMoonPosition(time: Date, observer: ObserverLocation) {
  const obs = new Astronomy.Observer(observer.latitude, observer.longitude, observer.elevation || 0);
  const equ = Astronomy.Equator(Astronomy.Body.Moon, time, obs, true, true);
  const hor = Astronomy.Horizon(time, obs, equ.ra, equ.dec, 'normal');
  const illum = Astronomy.Illumination(Astronomy.Body.Moon, time);
  
  return {
    altitude: hor.altitude,
    azimuth: hor.azimuth,
    position: horizontalToCartesian(hor.altitude, hor.azimuth),
    phase: illum.phase_angle,
    illumination: illum.phase_fraction,
    distanceAu: equ.dist,
    angularDiameterDeg: angularDiameterDeg(BODY_RADIUS_KM.Moon, equ.dist),
  };
}

export function getJupiterMoonsHorizontalPositions(time: Date, observer: ObserverLocation): JovianMoonHorizontalPosition[] {
  const obs = new Astronomy.Observer(observer.latitude, observer.longitude, observer.elevation || 0);

  // Work in EQJ/J2000 so vectors add cleanly.
  const observerVec = Astronomy.ObserverVector(time, obs, false);
  const jupiterVec = Astronomy.GeoVector(Astronomy.Body.Jupiter, time, false);
  const moons = Astronomy.JupiterMoons(time);

  const entries: Array<{ name: JovianMoonHorizontalPosition['name']; state: Astronomy.StateVector }> = [
    { name: 'Io', state: moons.io },
    { name: 'Europa', state: moons.europa },
    { name: 'Ganymede', state: moons.ganymede },
    { name: 'Callisto', state: moons.callisto },
  ];

  const result: JovianMoonHorizontalPosition[] = [];
  for (const m of entries) {
    // Geocentric moon vector in EQJ
    const geo = new Astronomy.Vector(
      jupiterVec.x + m.state.x,
      jupiterVec.y + m.state.y,
      jupiterVec.z + m.state.z,
      jupiterVec.t
    );
    // Topocentric vector from observer to moon
    const top = new Astronomy.Vector(
      geo.x - observerVec.x,
      geo.y - observerVec.y,
      geo.z - observerVec.z,
      geo.t
    );

    const eq = Astronomy.EquatorFromVector(top);
    const hor = Astronomy.Horizon(time, obs, eq.ra, eq.dec, 'normal');
    result.push({ name: m.name, altitude: hor.altitude, azimuth: hor.azimuth });
  }

  return result;
}

/**
 * Calculate atmospheric color based on sun altitude
 */
export function getAtmosphericColor(sunAltitude: number): {
  zenith: string;
  horizon: string;
  intensity: number;
} {
  if (sunAltitude > 0) {
    // Day time
    return {
      zenith: '#87CEEB',
      horizon: '#FFE5B4',
      intensity: 1.0
    };
  } else if (sunAltitude > -6) {
    // Civil twilight
    return {
      zenith: '#1a2332',
      horizon: '#ff6b35',
      intensity: 0.4
    };
  } else if (sunAltitude > -12) {
    // Nautical twilight
    return {
      zenith: '#0a0e1a',
      horizon: '#4a5568',
      intensity: 0.2
    };
  } else if (sunAltitude > -18) {
    // Astronomical twilight
    return {
      zenith: '#000510',
      horizon: '#1a1f35',
      intensity: 0.1
    };
  } else {
    // Night
    return {
      zenith: '#000000',
      horizon: '#000510',
      intensity: 0.0
    };
  }
}

/**
 * Calculate star visibility based on magnitude and Bortle scale
 */
export function isStarVisible(magnitude: number, bortleScale: number, sunAltitude: number): boolean {
  // Don't show stars in daylight
  if (sunAltitude > -6) return false;
  
  // Limiting magnitude based on Bortle scale
  const limitingMag = [8.0, 7.6, 7.1, 6.6, 6.1, 5.6, 5.1, 4.6, 4.1][bortleScale - 1] || 6.0;
  
  return magnitude <= limitingMag;
}
