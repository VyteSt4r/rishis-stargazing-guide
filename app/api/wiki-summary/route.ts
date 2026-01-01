import { NextRequest, NextResponse } from 'next/server'

type WikiSummary = {
  title: string
  extract?: string
  description?: string
  thumbnail?: { source: string; width: number; height: number }
  content_urls?: { desktop?: { page?: string } }
  type?: string
}

async function fetchWikiSummary(title: string): Promise<WikiSummary | null> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
  const res = await fetch(url, {
    // Keep caching conservative; star lookups are repeated but not critical.
    next: { revalidate: 60 * 60 * 24 },
    headers: {
      Accept: 'application/json',
    },
  })

  if (!res.ok) return null
  return (await res.json()) as WikiSummary
}

async function searchWikiTitle(query: string): Promise<string | null> {
  const url = `https://en.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(query)}&limit=5`
  const res = await fetch(url, {
    next: { revalidate: 60 * 60 * 24 },
    headers: {
      Accept: 'application/json',
    },
  })

  if (!res.ok) return null
  const data = (await res.json()) as any
  const title = data?.pages?.[0]?.title
  return typeof title === 'string' && title.trim() ? title : null
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const q = (searchParams.get('q') || '').trim()
  const kind = (searchParams.get('kind') || '').trim().toLowerCase()

  if (!q) {
    return NextResponse.json({ error: 'Missing q parameter' }, { status: 400 })
  }

  try {
    // Try direct title first.
    // This endpoint is used by multiple object types. Avoid biasing everything toward stars.
    const directAttempts: string[] = [q]

    if (kind === 'star') {
      directAttempts.push(`${q} (star)`, `${q} star`)
    } else if (kind === 'planet') {
      directAttempts.push(`${q} (planet)`, `${q} planet`)
    } else if (kind === 'comet') {
      directAttempts.push(`${q} (comet)`, `${q} comet`)
    } else if (kind === 'dso' || kind === 'nebula') {
      // Lightweight nudges that help for some objects without being too opinionated.
      directAttempts.push(`${q} nebula`, `${q} galaxy`)
    }

    for (const attempt of directAttempts) {
      const summary = await fetchWikiSummary(attempt)
      if (summary?.extract && summary.type !== 'disambiguation') {
        return NextResponse.json({
          title: summary.title,
          extract: summary.extract,
          description: summary.description,
          url: summary.content_urls?.desktop?.page,
          thumbnail: summary.thumbnail?.source,
        })
      }
    }

    // Fall back to search. Use kind-aware hints.
    const hint = kind === 'star' ? ' star' : kind === 'planet' ? ' planet' : kind === 'comet' ? ' comet' : ''
    const bestTitle = await searchWikiTitle(`${q}${hint}`)
    if (bestTitle) {
      const summary = await fetchWikiSummary(bestTitle)
      if (summary?.extract) {
        return NextResponse.json({
          title: summary.title,
          extract: summary.extract,
          description: summary.description,
          url: summary.content_urls?.desktop?.page,
          thumbnail: summary.thumbnail?.source,
        })
      }
    }

    return NextResponse.json({ error: 'No Wikipedia summary found' }, { status: 404 })
  } catch (error) {
    console.error('Error fetching Wikipedia summary:', error)
    return NextResponse.json({ error: 'Failed to fetch Wikipedia summary' }, { status: 500 })
  }
}
