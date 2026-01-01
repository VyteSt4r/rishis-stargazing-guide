import { NextResponse } from 'next/server'

export async function GET() {
  try {
    // Use wheretheiss.at API as fallback since open-notify is down
    const response = await fetch('https://api.wheretheiss.at/v1/satellites/25544')

    if (!response.ok) {
      throw new Error('Failed to fetch from ISS API')
    }

    const data = await response.json()
    
    // Convert to open-notify format for compatibility
    return NextResponse.json({
      iss_position: {
        latitude: data.latitude.toString(),
        longitude: data.longitude.toString()
      },
      timestamp: Math.floor(data.timestamp),
      message: 'success'
    })
  } catch (error) {
    console.error('Error fetching ISS position:', error)
    return NextResponse.json(
      { error: 'Failed to fetch ISS position' },
      { status: 500 }
    )
  }
}
