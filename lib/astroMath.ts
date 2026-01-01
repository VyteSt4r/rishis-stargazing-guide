const DEG2RAD = Math.PI / 180
const RAD2DEG = 180 / Math.PI
const TWO_PI = Math.PI * 2

const normalizeAngle = (deg: number) => {
  const normalized = deg % 360
  return normalized < 0 ? normalized + 360 : normalized
}

const wrapTwoPi = (rad: number) => {
  const wrapped = rad % TWO_PI
  return wrapped < 0 ? wrapped + TWO_PI : wrapped
}

export const toJulianDate = (date: Date) => date.getTime() / 86400000 + 2440587.5

export const greenwichSiderealTime = (date: Date) => {
  const jd = toJulianDate(date)
  const d = jd - 2451545.0
  const gst = 280.46061837 + 360.98564736629 * d
  return normalizeAngle(gst)
}

export const localSiderealTime = (date: Date, longitude: number) => {
  const gst = greenwichSiderealTime(date)
  const lst = gst + longitude
  return normalizeAngle(lst)
}

export const raDecToAltAz = (
  raDeg: number,
  decDeg: number,
  latDeg: number,
  lonDeg: number,
  date: Date
) => {
  const ra = raDeg * DEG2RAD
  const dec = decDeg * DEG2RAD
  const lat = latDeg * DEG2RAD
  const lst = localSiderealTime(date, lonDeg) * DEG2RAD
  const hourAngle = wrapTwoPi(lst - ra)

  const sinAlt = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(hourAngle)
  const alt = Math.asin(sinAlt)

  const az = wrapTwoPi(
    Math.atan2(
      -Math.sin(hourAngle),
      Math.tan(dec) * Math.cos(lat) - Math.sin(lat) * Math.cos(hourAngle)
    )
  )

  return { alt, az }
}

export const altAzToVector = (alt: number, az: number): [number, number, number] => {
  const cosAlt = Math.cos(alt)
  return [cosAlt * Math.sin(az), Math.sin(alt), cosAlt * Math.cos(az)]
}

export const radToDeg = (rad: number) => rad * RAD2DEG

export const clampAlt = (alt: number, minimum: number = -5 * DEG2RAD) => alt >= minimum
