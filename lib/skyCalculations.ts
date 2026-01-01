/**
 * Astronomy calculations for sky positioning and coordinate transformations
 */

export interface SkyPosition {
  altitude: number; // degrees above horizon (0-90)
  azimuth: number; // degrees from north (0-360)
}

export interface EquatorialCoords {
  ra: number; // Right Ascension in degrees (0-360)
  dec: number; // Declination in degrees (-90 to 90)
}

export interface ObserverLocation {
  latitude: number; // degrees
  longitude: number; // degrees
}

/**
 * Convert degrees to radians
 */
export function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Convert radians to degrees
 */
export function toDegrees(radians: number): number {
  return radians * (180 / Math.PI);
}

/**
 * Normalize angle to 0-360 range
 */
export function normalizeAngle(degrees: number): number {
  let normalized = degrees % 360;
  if (normalized < 0) normalized += 360;
  return normalized;
}

/**
 * Calculate Local Sidereal Time (LST) for a given date and longitude
 * LST is the Right Ascension currently on the observer's meridian
 */
export function calculateLST(date: Date, longitude: number): number {
  // Julian Date calculation
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  const second = date.getUTCSeconds();
  
  let y = year;
  let m = month;
  
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  
  const jd = Math.floor(365.25 * (y + 4716)) + 
             Math.floor(30.6001 * (m + 1)) + 
             day + b - 1524.5;
  
  const ut = hour + minute / 60 + second / 3600;
  const jdFull = jd + ut / 24;
  
  // Days since J2000.0
  const d = jdFull - 2451545.0;
  
  // Greenwich Mean Sidereal Time
  const gmst = 280.46061837 + 360.98564736629 * d;
  
  // Local Sidereal Time
  const lst = normalizeAngle(gmst + longitude);
  
  return lst;
}

/**
 * Convert equatorial coordinates (RA/Dec) to horizontal coordinates (Alt/Az)
 * for a given observer location and time
 */
export function equatorialToHorizontal(
  equatorial: EquatorialCoords,
  observer: ObserverLocation,
  date: Date
): SkyPosition {
  const { ra, dec } = equatorial;
  const { latitude, longitude } = observer;
  
  // Calculate Local Sidereal Time
  const lst = calculateLST(date, longitude);
  
  // Hour Angle = LST - RA
  const hourAngle = normalizeAngle(lst - ra);
  
  // Convert to radians for trigonometry
  const haRad = toRadians(hourAngle);
  const decRad = toRadians(dec);
  const latRad = toRadians(latitude);
  
  // Calculate altitude
  const sinAlt = Math.sin(decRad) * Math.sin(latRad) + 
                 Math.cos(decRad) * Math.cos(latRad) * Math.cos(haRad);
  const altitude = toDegrees(Math.asin(sinAlt));
  
  // Calculate azimuth
  const cosAz = (Math.sin(decRad) - Math.sin(latRad) * sinAlt) / 
                (Math.cos(latRad) * Math.cos(toRadians(altitude)));
  
  let azimuth = toDegrees(Math.acos(Math.max(-1, Math.min(1, cosAz))));
  
  // Adjust azimuth based on hour angle
  if (Math.sin(haRad) > 0) {
    azimuth = 360 - azimuth;
  }
  
  return { altitude, azimuth: normalizeAngle(azimuth) };
}

/**
 * Convert horizontal coordinates (Alt/Az) to equatorial coordinates (RA/Dec)
 * for a given observer location and time.
 *
 * Conventions match `equatorialToHorizontal`:
 * - Azimuth is measured from North (0°) through East (90°), clockwise.
 * - RA is in degrees [0,360), Dec in degrees [-90,90].
 */
export function horizontalToEquatorial(
  horizontal: SkyPosition,
  observer: ObserverLocation,
  date: Date
): EquatorialCoords {
  const { altitude, azimuth } = horizontal;
  const { latitude, longitude } = observer;

  // Local Sidereal Time
  const lst = calculateLST(date, longitude);

  const altRad = toRadians(altitude);
  const azRad = toRadians(azimuth);
  const latRad = toRadians(latitude);

  // Declination
  const sinDec = Math.sin(altRad) * Math.sin(latRad) +
    Math.cos(altRad) * Math.cos(latRad) * Math.cos(azRad);
  const decRad = Math.asin(Math.max(-1, Math.min(1, sinDec)));
  const dec = toDegrees(decRad);

  // Hour angle
  const cosDec = Math.cos(decRad);
  const sinH = -(Math.sin(azRad) * Math.cos(altRad)) / Math.max(1e-9, cosDec);
  const cosH = (Math.sin(altRad) - Math.sin(latRad) * Math.sin(decRad)) /
    (Math.cos(latRad) * Math.max(1e-9, cosDec));
  const hourAngle = normalizeAngle(toDegrees(Math.atan2(sinH, cosH)));

  // RA = LST - HA
  const ra = normalizeAngle(lst - hourAngle);

  return { ra, dec };
}

/**
 * Check if a celestial object is visible (above horizon)
 */
export function isVisible(position: SkyPosition): boolean {
  return position.altitude > 0;
}

/**
 * Convert horizontal coordinates to 3D cartesian coordinates for rendering
 * Returns position on a unit sphere centered at origin
 */
export function horizontalToCartesian(position: SkyPosition): [number, number, number] {
  const { altitude, azimuth } = position;
  
  // Convert to radians
  const altRad = toRadians(altitude);
  const azRad = toRadians(azimuth);
  
  // Convert to cartesian (azimuth measured from North, clockwise)
  // In Three.js: x = east/west, y = up/down, z = north/south
  const x = Math.cos(altRad) * Math.sin(azRad);
  const y = Math.sin(altRad);
  const z = -Math.cos(altRad) * Math.cos(azRad);
  
  return [x, y, z];
}

/**
 * Get the default observer location (Bangalore, India)
 */
export function getDefaultLocation(): ObserverLocation {
  return {
    latitude: 12.9716,
    longitude: 77.5946,
  };
}

/**
 * Calculate positions for all stars at a given time and location
 */
export function calculateStarPositions(
  stars: Array<{ ra: number; dec: number; [key: string]: any }>,
  observer: ObserverLocation,
  date: Date
): Array<{ altitude: number; azimuth: number; x: number; y: number; z: number; visible: boolean }> {
  return stars.map(star => {
    const horizontal = equatorialToHorizontal(
      { ra: star.ra, dec: star.dec },
      observer,
      date
    );
    const [x, y, z] = horizontalToCartesian(horizontal);
    
    return {
      altitude: horizontal.altitude,
      azimuth: horizontal.azimuth,
      x,
      y,
      z,
      visible: isVisible(horizontal),
    };
  });
}

/**
 * Get a formatted time string for display
 */
export function formatTime(date: Date): string {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
