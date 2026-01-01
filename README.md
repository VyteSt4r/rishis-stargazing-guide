# Rishi's Stargazing Guide

A personal digital observatory built with Next.js: an interactive sky map, ISS tracking, moon phase, satellite TLE fetching, comet elements, and lightweight star/object lookups. It is designed to be fast to run locally and easy to extend.

## What you can do

- Explore an interactive sky map and star field
- Track the ISS position and estimate upcoming passes
- Browse satellite TLE groups (visual, stations, Starlink)
- Pull comet orbital elements (MPC CometEls)
- Resolve sky coordinates to an object via SIMBAD
- Fetch short Wikipedia summaries for stars/planets/DSOs

## Pages

- `/` Main dashboard
- `/skymap` Sky map view
- `/stargazing` Stargazing conditions and guides
- `/stellarium` Embedded Stellarium Web
- `/stellarium-sky` Stellarium sky view

## API routes

All routes are implemented as Next.js Route Handlers under `app/api/`.

- `GET /api/iss-position`
	- Returns current ISS position (via `wheretheiss.at`) in an open-notify compatible shape.
- `GET /api/iss-pass?lat=<number>&lon=<number>&n=<number>`
	- Returns approximate upcoming ISS pass times for a location.
- `GET /api/satellites?group=visual|stations|starlink`
	- Returns parsed TLEs from Celestrak with conservative caching.
- `GET /api/comets?limit=<number>`
	- Returns a bounded list of comets parsed from MPC `CometEls.txt`.
- `GET /api/star-resolve?ra=<deg>&dec=<deg>`
	- Resolves coordinates via SIMBAD and returns identifiers and best name.
- `GET /api/wiki-summary?q=<query>&kind=star|planet|comet|dso|nebula`
	- Returns a summary extract/thumbnail/url from Wikipedia.

## Tech stack

- Next.js (App Router) + React + TypeScript
- Tailwind CSS
- React Query for data fetching/caching
- Three.js / React Three Fiber for 3D visuals
- Leaflet / React Leaflet for maps

## Getting started

Prereqs: Node.js 18+ and npm.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

### Production build

```bash
npm run build
npm run start
```

## Configuration (optional)

This project mostly relies on public upstream data sources. There is an example env file at `.env.local.example`.

- `NASA_API_KEY` is currently only used by a placeholder hook in `hooks/useAstronomyData.ts`.

## Data and accuracy notes

- Data sources: `DATA_SOURCES.md`
- Accuracy notes and caveats: `DATA_ACCURACY.md`

## License

No license is currently specified. If you intend others to use or contribute, add a license file.
