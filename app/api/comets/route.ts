import { NextRequest, NextResponse } from 'next/server'

export type CometElements = {
  packed: string
  perihelionTimeUtc: string // ISO string
  perihelionDistanceAu: number // q
  eccentricity: number // e
  argPerihelionDeg: number // w
  ascNodeDeg: number // node
  inclinationDeg: number // i
  epochYmd: string
  magnitudeG: number | null // M1
  magnitudeK: number | null // K1
  name: string
}

function dayFractionToIsoUtc(year: number, month: number, dayWithFraction: number): string {
  const dayInt = Math.max(1, Math.floor(dayWithFraction))
  const frac = Math.max(0, dayWithFraction - dayInt)
  const totalSeconds = frac * 86400
  const hh = Math.floor(totalSeconds / 3600)
  const mm = Math.floor((totalSeconds - hh * 3600) / 60)
  const ss = Math.round(totalSeconds - hh * 3600 - mm * 60)

  // Normalize rounding overflow.
  const date = new Date(Date.UTC(year, month - 1, dayInt, hh, mm, ss))
  return date.toISOString()
}

function parseMpcCometEls(text: string): CometElements[] {
  const lines = text.split(/\r?\n/)
  const out: CometElements[] = []

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (!line) continue
    // Skip headers/comments.
    if (line.startsWith('#') || line.startsWith('(') || line.startsWith('Format')) continue

    // MPC CometEls.txt is whitespace-delimited, with the name at the end.
    const parts = line.trim().split(/\s+/)
    // Expected: packed y m d q e w node i epoch M1 K1 name...
    if (parts.length < 12) continue

    const packed = parts[0]
    const year = Number(parts[1])
    const month = Number(parts[2])
    const day = Number(parts[3])
    const q = Number(parts[4])
    const e = Number(parts[5])
    const w = Number(parts[6])
    const node = Number(parts[7])
    const inc = Number(parts[8])
    const epochYmd = String(parts[9])

    const m1Raw = parts[10]
    const k1Raw = parts[11]
    const name = parts.slice(12).join(' ').trim()

    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) continue
    if (!Number.isFinite(q) || !Number.isFinite(e) || !Number.isFinite(w) || !Number.isFinite(node) || !Number.isFinite(inc)) continue

    const magnitudeG = Number.isFinite(Number(m1Raw)) ? Number(m1Raw) : null
    const magnitudeK = Number.isFinite(Number(k1Raw)) ? Number(k1Raw) : null

    out.push({
      packed,
      perihelionTimeUtc: dayFractionToIsoUtc(year, month, day),
      perihelionDistanceAu: q,
      eccentricity: e,
      argPerihelionDeg: w,
      ascNodeDeg: node,
      inclinationDeg: inc,
      epochYmd,
      magnitudeG,
      magnitudeK,
      name: name || packed,
    })
  }

  return out
}

async function fetchCometElsText(): Promise<string> {
  const urls = [
    'https://minorplanetcenter.net/iau/MPCORB/CometEls.txt',
  ]

  let lastErr: unknown = null
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        // Changes slowly (daily-ish). Cache aggressively.
        next: { revalidate: 60 * 60 * 24 },
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
  throw lastErr ?? new Error('Failed to fetch comet elements')
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const limitParam = searchParams.get('limit')
  const limit = Math.max(10, Math.min(500, Number(limitParam || 200)))

  try {
    const text = await fetchCometElsText()
    const all = parseMpcCometEls(text)

    // Keep payload/CPU bounded. Default selection heuristic: closest perihelion first.
    const sorted = all
      .filter((c) => Number.isFinite(c.perihelionDistanceAu) && c.perihelionDistanceAu > 0)
      .sort((a, b) => a.perihelionDistanceAu - b.perihelionDistanceAu)

    const limited = sorted.slice(0, limit)

    return NextResponse.json(
      {
        source: 'MPC CometEls.txt',
        count: limited.length,
        comets: limited,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error('Error fetching comets:', error)
    return NextResponse.json({ error: 'Failed to fetch comet elements' }, { status: 500 })
  }
}
