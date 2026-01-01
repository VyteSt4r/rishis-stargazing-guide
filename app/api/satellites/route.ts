import { NextRequest, NextResponse } from 'next/server'

type SatelliteTLE = {
  name: string
  line1: string
  line2: string
}

function parseTleText(text: string): SatelliteTLE[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const out: SatelliteTLE[] = []
  for (let i = 0; i + 2 < lines.length; i++) {
    const name = lines[i]
    const line1 = lines[i + 1]
    const line2 = lines[i + 2]
    if (!line1?.startsWith('1 ') || !line2?.startsWith('2 ')) continue
    out.push({ name, line1, line2 })
    i += 2
  }
  return out
}

async function fetchFirstOk(urls: string[]): Promise<string> {
  let lastErr: unknown = null
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        // Keep caching conservative; this data changes but not minute-to-minute.
        next: { revalidate: 60 * 60 * 6 },
        headers: { Accept: 'text/plain' },
      })
      if (!res.ok) {
        lastErr = new Error(`Fetch failed (${res.status}) for ${url}`)
        continue
      }
      return await res.text()
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr ?? new Error('Failed to fetch TLE data')
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const group = (searchParams.get('group') || 'visual').trim().toLowerCase()

  // Default to a small, popular set of human-visible satellites.
  // Supported groups here are intentionally limited to keep payload/CPU reasonable.
  const groupMap: Record<string, string[]> = {
    visual: [
      'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle',
      'https://www.celestrak.com/NORAD/elements/visual.txt',
    ],
    stations: [
      'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle',
      'https://www.celestrak.com/NORAD/elements/stations.txt',
    ],
    starlink: [
      'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle',
      'https://www.celestrak.com/NORAD/elements/starlink.txt',
    ],
  }

  const urls = groupMap[group]
  if (!urls) {
    return NextResponse.json({ error: 'Unsupported group' }, { status: 400 })
  }

  try {
    const text = await fetchFirstOk(urls)
    const sats = parseTleText(text)

    // Hard cap for safety.
    // Starlink can be very large; keep response bounded.
    const hardCap = group === 'starlink' ? 3000 : 250
    const limited = sats.slice(0, hardCap)

    return NextResponse.json(
      {
        group,
        count: limited.length,
        satellites: limited,
      },
      {
        status: 200,
      },
    )
  } catch (error) {
    console.error('Error fetching satellites TLE:', error)
    return NextResponse.json({ error: 'Failed to fetch satellite TLE data' }, { status: 500 })
  }
}
