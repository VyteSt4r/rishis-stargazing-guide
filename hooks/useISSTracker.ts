'use client'
import { useQuery } from '@tanstack/react-query'

export interface ISSPosition {
  latitude: number
  longitude: number
  timestamp: number
  altitude: number // km
  velocity: number // km/h
}

export interface ISSData {
  position: ISSPosition
  isVisible: boolean
  nextPass?: {
    risetime: number
    duration: number
  }
}

export type ISSTrackerHookResult = {
  position: ISSPosition | undefined
  isVisible: boolean
  nextPass: any[] | null | undefined
  isLoading: boolean
  passesLoading: boolean
  passesError: unknown
  error: unknown
  refetch: () => void
}

// Fetch current ISS position
async function fetchISSPosition(): Promise<ISSPosition> {
  try {
    const response = await fetch('/api/iss-position')
    if (!response.ok) throw new Error('Failed to fetch ISS position')
    
    const data = await response.json()
    
    return {
      latitude: parseFloat(data.iss_position.latitude),
      longitude: parseFloat(data.iss_position.longitude),
      timestamp: data.timestamp * 1000, // Convert to milliseconds
      altitude: 408, // ISS orbits at ~408km
      velocity: 27600 // ISS travels at ~27,600 km/h
    }
  } catch (error) {
    // Silently fail with last known position to avoid console spam
    throw error;
  }
}

// Fetch ISS pass times for a location (get next 5 passes)
async function fetchISSPasses(lat: number, lon: number) {
  try {
    console.log('Fetching ISS passes for:', lat, lon)
    const response = await fetch(
      `/api/iss-pass?lat=${lat}&lon=${lon}&n=5`
    )
    console.log('Response status:', response.status)
    
    if (!response.ok) {
      console.error('Failed to fetch ISS passes:', response.statusText)
      return []
    }
    
    const data = await response.json()
    console.log('ISS passes data:', data)
    return data.response || []
  } catch (error) {
    console.error('Error fetching ISS passes:', error)
    return []
  }
}

// Calculate if ISS is visible from a location (simplified)
function calculateVisibility(
  issLat: number,
  issLon: number,
  userLat: number,
  userLon: number
): boolean {
  // Simple distance calculation
  const distance = Math.sqrt(
    Math.pow(issLat - userLat, 2) + Math.pow(issLon - userLon, 2)
  )
  
  // ISS visible if within ~5 degrees (very simplified)
  return distance < 5
}

export function useISSTracker(userLat?: number, userLon?: number): ISSTrackerHookResult {
  const { data: position, isLoading, error, refetch } = useQuery({
    queryKey: ['iss-position'],
    queryFn: fetchISSPosition,
    refetchInterval: 5000, // Update every 5 seconds
    staleTime: 4000,
    retry: 2, // Reduce retries to avoid spam
    retryDelay: 5000
  })

  const { data: nextPass, isLoading: passesLoading, error: passesError } = useQuery({
    queryKey: ['iss-passes', userLat, userLon],
    queryFn: () => {
      if (userLat && userLon) {
        return fetchISSPasses(userLat, userLon)
      }
      return null
    },
    enabled: !!userLat && !!userLon,
    staleTime: 1000 * 60 * 30, // Refresh every 30 minutes
    retry: 2,
    retryDelay: 5000
  })

  const isVisible = position && userLat && userLon
    ? calculateVisibility(position.latitude, position.longitude, userLat, userLon)
    : false

  return {
    position: position as ISSPosition | undefined,
    isVisible,
    nextPass: nextPass as any[] | null | undefined,
    isLoading,
    passesLoading,
    passesError,
    error,
    refetch: refetch as unknown as () => void
  }
}
