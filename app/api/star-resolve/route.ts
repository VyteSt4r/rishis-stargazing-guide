export const runtime = 'nodejs';

import { NextResponse } from 'next/server';

type SimbadCooMatch = {
  mainId: string;
  otype: string;
  distArcsec: number;
};

type ResolveResult = {
  mainId: string;
  otype: string;
  distArcsec: number;
  bestName: string;
  names: string[];
  identifiers: string[];
  hip?: string;
  hd?: string;
  hr?: string;
};

const cache = new Map<string, { ts: number; value: ResolveResult | null }>();
const CACHE_TTL_MS = 1000 * 60 * 60; // 1h

function toKey(ra: number, dec: number) {
  // Round enough to make caching effective but not too coarse.
  return `${ra.toFixed(5)},${dec.toFixed(5)}`;
}

function pickBestName(mainId: string, identifiers: string[]) {
  const names = identifiers
    .filter((id) => /^NAME\s+/i.test(id))
    .map((id) => id.replace(/^NAME\s+/i, '').trim())
    .filter(Boolean);

  const uniqueNames = Array.from(new Set(names));

  const preferredName = uniqueNames
    .slice()
    .sort((a, b) => a.length - b.length)[0];

  const cleanedMainId = mainId
    .replace(/^\*\s+/, '')
    .replace(/^\*\*\s+/, '')
    .trim();

  return {
    bestName: preferredName || cleanedMainId || mainId,
    names: uniqueNames,
  };
}

function pickCatalogId(identifiers: string[], prefix: string) {
  const re = new RegExp(`^${prefix}\\s+(.+)$`, 'i');
  const hit = identifiers.find((id) => re.test(id));
  if (!hit) return undefined;
  return hit.replace(re, '$1').trim();
}

function splitIdentifiersLine(line: string) {
  // SIMBAD ASCII uses multi-space columns; split on 2+ spaces.
  return line
    .trim()
    .split(/\s{2,}/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseIdentifiersFromSimIdAscii(text: string) {
  const lines = text.split(/\r?\n/);
  const startIdx = lines.findIndex((l) => /^Identifiers\s*\(\d+\):/i.test(l));
  if (startIdx < 0) return [];

  const identifiers: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) break;
    if (/^Bibcodes\b/i.test(line)) break;

    const items = splitIdentifiersLine(line);
    for (const item of items) identifiers.push(item);
  }

  // De-dupe preserving order.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of identifiers) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function parseFirstMatchFromSimCooAscii(text: string): SimbadCooMatch | null {
  const lines = text.split(/\r?\n/);
  const hasZero = lines.some((l) => /Number of objects\s*:\s*0\b/i.test(l));
  if (hasZero) return null;

  // Find first table row like: 1| 0.00|* alf CMa|SB*|...
  const row = lines.find((l) => /^\s*1\|/.test(l));
  if (!row) return null;

  const parts = row.split('|').map((p) => p.trim());
  // parts[0]=1, [1]=dist, [2]=identifier, [3]=typ
  const distArcsec = Number(parts[1]);
  const mainId = parts[2] || '';
  const otype = parts[3] || '';

  if (!mainId || !Number.isFinite(distArcsec)) return null;

  return { mainId, otype, distArcsec };
}

async function fetchText(url: string) {
  const res = await fetch(url, {
    // Avoid Next.js edge caching; we do our own TTL cache.
    cache: 'no-store',
    headers: {
      'User-Agent': 'Project-Stargazer/1.0 (star resolver)',
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Upstream error ${res.status}: ${text.slice(0, 200)}`);
  }
  return text;
}

async function simbadResolveByCoords(ra: number, dec: number): Promise<ResolveResult | null> {
  // Try tight radius first; widen if nothing found.
  const radiiArcsec = [10, 30, 60];

  let coo: SimbadCooMatch | null = null;
  for (const radius of radiiArcsec) {
    const u = new URL('https://simbad.u-strasbg.fr/simbad/sim-coo');
    u.searchParams.set('Coord', `${ra} ${dec}`);
    u.searchParams.set('Coord.unit', 'deg');
    u.searchParams.set('Radius', String(radius));
    u.searchParams.set('Radius.unit', 'arcsec');
    u.searchParams.set('output.format', 'ASCII');
    u.searchParams.set('output.max', '1');

    const text = await fetchText(u.toString());
    coo = parseFirstMatchFromSimCooAscii(text);
    if (coo) break;
  }

  if (!coo) return null;

  const u2 = new URL('https://simbad.u-strasbg.fr/simbad/sim-id');
  u2.searchParams.set('Ident', coo.mainId);
  u2.searchParams.set('output.format', 'ASCII');

  const text2 = await fetchText(u2.toString());
  const identifiers = parseIdentifiersFromSimIdAscii(text2);

  const { bestName, names } = pickBestName(coo.mainId, identifiers);

  const hip = pickCatalogId(identifiers, 'HIP');
  const hd = pickCatalogId(identifiers, 'HD');
  const hr = pickCatalogId(identifiers, 'HR');

  return {
    mainId: coo.mainId,
    otype: coo.otype,
    distArcsec: coo.distArcsec,
    bestName,
    names,
    identifiers,
    hip,
    hd,
    hr,
  };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ra = Number(searchParams.get('ra'));
    const dec = Number(searchParams.get('dec'));

    if (!Number.isFinite(ra) || !Number.isFinite(dec)) {
      return NextResponse.json({ error: 'Missing or invalid ra/dec' }, { status: 400 });
    }

    if (ra < 0 || ra >= 360 || dec < -90 || dec > 90) {
      return NextResponse.json({ error: 'ra/dec out of range' }, { status: 400 });
    }

    const key = toKey(ra, dec);
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && now - cached.ts < CACHE_TTL_MS) {
      return NextResponse.json({ ok: true, cached: true, result: cached.value });
    }

    const result = await simbadResolveByCoords(ra, dec);
    cache.set(key, { ts: now, value: result });

    return NextResponse.json({ ok: true, cached: false, result });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: String((err as any)?.message || err),
      },
      { status: 500 },
    );
  }
}
