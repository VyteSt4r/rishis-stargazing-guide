import { useQuery } from '@tanstack/react-query'

async function fetchNEOs() {
  // Placeholder: expects NASA_API_KEY in env
  const key = process.env.NASA_API_KEY || ''
  if (!key) return []
  const res = await fetch(`https://api.nasa.gov/neo/rest/v1/feed?api_key=${key}`)
  if (!res.ok) throw new Error('Failed to fetch NEOs')
  return res.json()
}

async function fetchSatellites(lat: number, lon: number) {
  // Placeholder for N2YO or similar
  return []
}

export function useNEOs() {
  return useQuery({
    queryKey: ['neos'],
    queryFn: fetchNEOs,
    staleTime: 1000 * 60 * 5,
  })
}

export function useSatellites(lat?: number, lon?: number) {
  return useQuery({
    queryKey: ['sats', lat, lon],
    queryFn: () => fetchSatellites(lat || 0, lon || 0),
    enabled: typeof lat === 'number' && typeof lon === 'number',
  })
}
