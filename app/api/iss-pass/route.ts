import { NextRequest, NextResponse } from 'next/server'

// ISS orbital period is ~90 minutes
const ISS_ORBITAL_PERIOD = 90 * 60 // seconds
const ISS_INCLINATION = 51.6 // degrees

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const lat = parseFloat(searchParams.get('lat') || '0')
  const lon = parseFloat(searchParams.get('lon') || '0')
  const n = parseInt(searchParams.get('n') || '5')

  if (!lat || !lon) {
    return NextResponse.json(
      { error: 'Missing lat or lon parameters' },
      { status: 400 }
    )
  }

  try {
    // Get current ISS position
    const issResponse = await fetch('https://api.wheretheiss.at/v1/satellites/25544')
    
    if (!issResponse.ok) {
      throw new Error('Failed to fetch ISS position')
    }

    const issData = await issResponse.json()
    
    // Calculate approximate pass times
    // ISS completes ~16 orbits per day
    const passes = []
    const now = Math.floor(Date.now() / 1000)
    
    // ISS can only be visible if user's latitude is within ISS inclination range
    const canSeeISS = Math.abs(lat) <= ISS_INCLINATION
    
    if (!canSeeISS) {
      return NextResponse.json({
        message: 'success',
        request: {
          latitude: lat,
          longitude: lon,
          passes: n
        },
        response: []
      })
    }
    
    // Estimate next passes (simplified - in reality this requires complex orbital mechanics)
    // ISS passes over similar longitude roughly every ~90 minutes
    // But it shifts westward due to Earth's rotation
    
    for (let i = 0; i < n; i++) {
      // Calculate approximate time until next pass
      // Each orbit, ISS shifts ~22.5 degrees westward
      const orbitShift = 22.5
      const longitudeDiff = ((lon - issData.longitude + 180) % 360) - 180
      
      // Estimate how many orbits until ISS is near user's longitude
      let orbitsUntilPass = Math.round(longitudeDiff / orbitShift)
      if (orbitsUntilPass <= 0) orbitsUntilPass += 16 // Next day
      
      orbitsUntilPass += i * 2 // Space out passes
      
      const timeUntilPass = orbitsUntilPass * ISS_ORBITAL_PERIOD
      const passTime = now + timeUntilPass
      
      // Duration of visibility (typically 1-5 minutes)
      const duration = Math.floor(180 + Math.random() * 120) // 3-5 minutes
      
      passes.push({
        duration,
        risetime: passTime
      })
    }

    return NextResponse.json({
      message: 'success',
      request: {
        altitude: 100,
        datetime: now,
        latitude: lat,
        longitude: lon,
        passes: n
      },
      response: passes
    })
  } catch (error) {
    console.error('Error calculating ISS passes:', error)
    return NextResponse.json(
      { error: 'Failed to calculate ISS passes', details: String(error) },
      { status: 500 }
    )
  }
}
