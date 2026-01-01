'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { constellationStars, constellationLines } from '@/lib/constellationData';
import { 
  getConstellationLineSegments, 
  constellationNames,
  type ConstellationLineSegment 
} from '@/lib/constellationLoader';
import {
  calculateStarPositions,
  getDefaultLocation,
  formatTime,
  equatorialToHorizontal,
  horizontalToEquatorial,
  type ObserverLocation,
} from '@/lib/skyCalculations';
import { getMoonPosition, getSunPosition, getPlanetHorizontalPositions, getJupiterMoonsHorizontalPositions } from '@/lib/astronomyUtils';
import { 
  loadFullStarCatalog, 
  getStarColorFromBV, 
  getStarSize, 
  shouldStarGlow,
  getStarAlpha,
  type StarRecord 
} from '@/lib/starCatalog';
import { 
  deepSkyObjects, 
  getDSOSymbol, 
  getDSOColorForObject,
  type DeepSkyObject 
} from '@/lib/deepSkyObjects';
import { compileTles, computeSatelliteHorizontalPositionsFromSatRecs, type CompiledSatellite, type SatelliteTLE } from '@/lib/satellites';
import { computeCometHorizontalPositions, estimateCometVisualWeight, type CometElements } from '@/lib/comets';
import { dsoDetectability, starVisibility } from '@/lib/visibility';
import { estimateBortleScaleForLocation } from '@/lib/lightPollutionData';

const MIN_RENDER_ALTITUDE_DEG = -90; // render full lower hemisphere
const MAX_CLICK_DIST_PX = 20;
const MAX_CONSTELLATION_CLICK_DIST_PX = 12;

let noiseTileCanvas: HTMLCanvasElement | null = null;
function getNoiseTileCanvas() {
  if (noiseTileCanvas) return noiseTileCanvas;
  const tile = document.createElement('canvas');
  tile.width = 256;
  tile.height = 256;
  const ctx = tile.getContext('2d');
  if (!ctx) return tile;

  const img = ctx.createImageData(tile.width, tile.height);
  // Simple deterministic PRNG
  let seed = 1337;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  for (let i = 0; i < img.data.length; i += 4) {
    const r = rand();
    // Mostly dark; occasional speck for subtle grain
    const v = r < 0.985 ? 0 : Math.floor(30 + rand() * 60);
    img.data[i + 0] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  noiseTileCanvas = tile;
  return tile;
}

let milkyWayTextureCanvas: HTMLCanvasElement | null = null;
let milkyWayTextureData: { w: number; h: number; data: Uint8ClampedArray } | null = null;

let starBloomCanvas: HTMLCanvasElement | null = null;
let starBloomKey: string | null = null;

function getStarBloomCanvas(width: number, height: number): HTMLCanvasElement {
  const w = Math.max(320, Math.floor(width));
  const h = Math.max(240, Math.floor(height));
  const key = `${w}x${h}`;
  if (!starBloomCanvas) starBloomCanvas = document.createElement('canvas');
  if (starBloomKey !== key) {
    starBloomCanvas.width = w;
    starBloomCanvas.height = h;
    starBloomKey = key;
  }
  return starBloomCanvas;
}

let moonSurfaceCanvas: HTMLCanvasElement | null = null;
let moonLightingCache: { key: string; canvas: HTMLCanvasElement } | null = null;

function getMoonSurfaceTextureCanvas() {
  if (moonSurfaceCanvas) return moonSurfaceCanvas;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const img = ctx.createImageData(size, size);
  const data = img.data;
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const r = size * 0.48;

  // Deterministic PRNG (stable; avoids crawling texture)
  let seed = 0x6d2b79f5;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  const clamp01Local = (v: number) => Math.max(0, Math.min(1, v));
  const smoothstep = (t: number) => t * t * (3 - 2 * t);

  const hash = (x: number, y: number) => {
    let n = (x | 0) * 374761393 + (y | 0) * 668265263 + 0x9e3779b9;
    n = (n ^ (n >>> 13)) >>> 0;
    n = (n * 1274126177) >>> 0;
    return (n >>> 0) / 0xffffffff;
  };
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const valueNoise = (x: number, y: number) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = x0 + 1;
    const y1 = y0 + 1;
    const sx = smoothstep(x - x0);
    const sy = smoothstep(y - y0);
    const n00 = hash(x0, y0);
    const n10 = hash(x1, y0);
    const n01 = hash(x0, y1);
    const n11 = hash(x1, y1);
    const ix0 = lerp(n00, n10, sx);
    const ix1 = lerp(n01, n11, sx);
    return lerp(ix0, ix1, sy);
  };
  const fbm = (u: number, v: number) => {
    let sum = 0;
    let amp = 0.6;
    let freq = 1.0;
    let norm = 0;
    for (let i = 0; i < 5; i++) {
      sum += amp * valueNoise(u * freq, v * freq);
      norm += amp;
      amp *= 0.55;
      freq *= 2.0;
    }
    return sum / Math.max(1e-6, norm);
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const rr = Math.hypot(dx, dy);
      const idx = (y * size + x) * 4;
      if (rr > r) {
        data[idx + 3] = 0;
        continue;
      }

      const nx = dx / r;
      const ny = dy / r;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));

      const u = (nx + 1) * 0.5;
      const v = (ny + 1) * 0.5;
      const maria = fbm(u * 3.2, v * 3.2);
      const high = fbm(u * 18.0, v * 18.0);

      let albedo = 0.74;
      albedo -= 0.11 * (maria - 0.5);
      albedo += 0.05 * (high - 0.5);

      // Gentle baked limb shading (base texture only)
      albedo *= 0.72 + 0.28 * nz;

      // A few large crater basins (fixed)
      const craterCount = 14;
      let craterShade = 0;
      for (let i = 0; i < craterCount; i++) {
        const ca = (i / craterCount) * Math.PI * 2 + 0.45;
        const cr = 0.08 + (i % 5) * 0.01;
        const cx2 = Math.cos(ca) * (0.15 + (i % 3) * 0.12);
        const cy2 = Math.sin(ca) * (0.10 + (i % 4) * 0.10);
        const d2 = Math.hypot(nx - cx2, ny - cy2);
        const t = clamp01Local(1 - d2 / cr);
        craterShade += t * t * 0.10;
      }
      albedo -= craterShade;

      // Micro-crater speckle
      const speck = rand();
      if (speck > 0.965) {
        albedo -= 0.06 * (speck - 0.965) / 0.035;
      }

      const g = Math.round(255 * clamp01Local(albedo));
      data[idx + 0] = g;
      data[idx + 1] = g;
      data[idx + 2] = g;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  moonSurfaceCanvas = canvas;
  return canvas;
}

function getMoonLightingCanvas(phaseAngleDeg: number) {
  const q = Math.round(Math.max(0, Math.min(180, phaseAngleDeg)) * 2) / 2; // 0.5° steps
  const key = `phase:${q}`;
  if (moonLightingCache?.key === key) return moonLightingCache.canvas;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const img = ctx.createImageData(size, size);
  const data = img.data;
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const r = size * 0.48;

  const phaseRad = (q * Math.PI) / 180;
  // View vector is +Z. Light vector lies in +X/+Z plane.
  const lx = Math.sin(phaseRad);
  const lz = Math.cos(phaseRad);

  const clamp01Local = (v: number) => Math.max(0, Math.min(1, v));
  const phaseFrac = 0.5 * (1 + Math.cos(phaseRad)); // [0..1]
  const earthshine = 0.08 + 0.20 * clamp01Local(0.35 - phaseFrac);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const rr = Math.hypot(dx, dy);
      const idx = (y * size + x) * 4;
      if (rr > r) {
        data[idx + 3] = 0;
        continue;
      }

      const nx = dx / r;
      const ny = dy / r;
      const nz2 = 1 - nx * nx - ny * ny;
      const nz = Math.sqrt(Math.max(0, nz2));

      // Lambertian lighting
      const ndotl = Math.max(0, nx * lx + nz * lz);
      // Extra limb darkening for perceived 3D shape
      const limb = 0.55 + 0.45 * nz;
      const shade = clamp01Local(earthshine + ndotl * limb);
      const g = Math.round(255 * shade);

      data[idx + 0] = g;
      data[idx + 1] = g;
      data[idx + 2] = g;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  moonLightingCache = { key, canvas };
  return canvas;
}

function getMilkyWayGalacticTextureCanvas() {
  if (milkyWayTextureCanvas) return milkyWayTextureCanvas;

  const size = 1024; // equirect galactic texture (l,b)
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const img = ctx.createImageData(size, size);
  const data = img.data;

  // Deterministic hash -> [0,1)
  const hash = (x: number, y: number, seed: number) => {
    let n = (x | 0) * 374761393 + (y | 0) * 668265263 + (seed | 0) * 1442695041;
    n = (n ^ (n >>> 13)) >>> 0;
    n = (n * 1274126177) >>> 0;
    return (n >>> 0) / 0xffffffff;
  };

  const smoothstep = (t: number) => t * t * (3 - 2 * t);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  const valueNoise = (x: number, y: number, seed: number) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = x0 + 1;
    const y1 = y0 + 1;
    const sx = smoothstep(x - x0);
    const sy = smoothstep(y - y0);

    const n00 = hash(x0, y0, seed);
    const n10 = hash(x1, y0, seed);
    const n01 = hash(x0, y1, seed);
    const n11 = hash(x1, y1, seed);

    const ix0 = lerp(n00, n10, sx);
    const ix1 = lerp(n01, n11, sx);
    return lerp(ix0, ix1, sy);
  };

  const fbm = (u: number, v: number, seed: number) => {
    let sum = 0;
    let amp = 0.55;
    let freq = 1.0;
    let norm = 0;
    for (let i = 0; i < 5; i++) {
      sum += amp * valueNoise(u * freq, v * freq, seed + i * 97);
      norm += amp;
      amp *= 0.55;
      freq *= 2.0;
    }
    return sum / norm;
  };

  // Generate a galactic-equirect Milky Way texture (l,b):
  // - u = galactic longitude l [0..360)
  // - v = galactic latitude b [-90..90]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1);
      const v = y / (size - 1);

      // Map v to galactic latitude b in [-90,90]
      const galLatDeg = (0.5 - v) * 180;
      const bAbs = Math.abs(galLatDeg);

      // Vary width/brightness along longitude for a more natural look
      const longWave = fbm(u * 2.0, 0.25, 555);
      const widthDeg = 7 + 10 * longWave; // band thickness varies
      const bandCore = Math.exp(-Math.pow(bAbs / (widthDeg * 0.55), 2));
      const bandWide = Math.exp(-Math.pow(bAbs / (widthDeg * 1.3), 2));
      const band = Math.max(bandCore, bandWide * 0.45);

      // Galactic bulge (bright, warm) near l≈0°, b≈0°
      const lDeg = u * 360;
      const lWrap = Math.min(lDeg, 360 - lDeg); // distance to 0° with wrap
      const bulgeL = Math.exp(-(lWrap * lWrap) / (2 * 18 * 18));
      const bulgeB = Math.exp(-(galLatDeg * galLatDeg) / (2 * 7 * 7));
      const bulge = bulgeL * bulgeB;

      const base = fbm(u * 2.4, v * 2.4, 1337);
      const clumps = fbm(u * 8.5, v * 8.5, 4242);
      const wisps = fbm(u * 16.0, v * 16.0, 9001);

      // Star-cloud density / nebulosity
      let intensity = band * (0.22 + 1.05 * base);
      intensity *= 0.55 + 0.90 * clumps;
      intensity += bandWide * 0.10 * (wisps - 0.5);

      // Dust lanes: subtract darker structure inside the band (mostly near the core)
      const dust = fbm(u * 12.0 + 4.6, v * 12.0 + 8.9, 777);
      const dust2 = fbm(u * 20.0 + 2.1, v * 20.0 + 6.4, 2024);
      const dustMask = band * Math.max(0, dust - 0.50) * 1.9 + bandCore * Math.max(0, dust2 - 0.56) * 1.35;
      intensity *= 1 - Math.min(0.72, dustMask);

      // Add tiny star-cloud speckles for texture detail (deterministic).
      // Keep subtle so it doesn't look like random noise.
      const micro = Math.pow(hash(x, y, 9091), 9) * bandCore * 0.85;
      intensity += micro;

      // Bulge brightness boost (kept under control by bandCore)
      intensity += bulge * bandCore * 0.65;

      // Dark rift: curving, noisy dust lane along the band (big realism cue)
      const riftCenterDeg =
        2.2 * Math.sin(2 * Math.PI * (u + 0.12)) +
        0.8 * Math.sin(2 * Math.PI * (u * 2.0 + 0.31));
      const riftDist = Math.abs(galLatDeg - riftCenterDeg);
      const riftProfile = Math.exp(-(riftDist * riftDist) / (2 * 2.4 * 2.4)) * band;
      const riftNoise = fbm(u * 10.0 + 12.3, v * 10.0 + 3.7, 8080);
      const riftMask2 = riftProfile * clamp01((riftNoise - 0.33) * 1.9);
      const riftStrength = 0.35 + 0.55 * bulgeL;
      intensity *= 1 - riftStrength * clamp01(riftMask2 * 1.4);

      intensity = Math.max(0, Math.min(1, intensity));

      // Lift the mid-tones so the band has visible structure without needing
      // to crank global alpha.
      const intensityLift = Math.pow(intensity, 0.78);
      const a = Math.max(0, Math.min(1, intensityLift * 1.25));

      // Color: neutral haze + cool star clouds + warm nebula patches.
      // Use clumps + wisps to create visible colored structure similar to Stellarium.
      const patchWarm = Math.max(0, Math.min(1, (clumps - 0.54) * 2.5));
      const patchCool = Math.max(0, Math.min(1, (wisps - 0.52) * 2.2));

      const haze = Math.pow(intensityLift, 1.25);
      const cool = Math.pow(intensityLift, 1.05);
      const warm = Math.pow(intensityLift, 1.55) * patchWarm;
      const teal = Math.pow(intensityLift, 1.35) * patchCool;

      // Base neutral
      let r = haze * 0.52;
      let g = haze * 0.66;
      let b = haze * 0.92;

      // Cool star-clouds
      r += cool * 0.07;
      g += cool * 0.13;
      b += cool * 0.26;

      // Warm emission regions (magenta/pink-ish)
      r += warm * 0.34;
      g += warm * 0.11;
      b += warm * 0.24;

      // Bulge warm tint (yellow/orange-ish)
      const bulgeWarm = bulge * (0.55 + 0.55 * clumps);
      r += bulgeWarm * 0.42;
      g += bulgeWarm * 0.16;
      b += bulgeWarm * 0.10;

      // Teal/blue nebulosity accents
      r += teal * 0.04;
      g += teal * 0.10;
      b += teal * 0.16;

      // Micro speckles: slightly warmer so they read as dense star fields.
      r += micro * 0.65;
      g += micro * 0.62;
      b += micro * 0.55;

      // Clamp
      r = Math.max(0, Math.min(1, r));
      g = Math.max(0, Math.min(1, g));
      b = Math.max(0, Math.min(1, b));

      const i = (y * size + x) * 4;
      data[i + 0] = Math.floor(r * 255);
      data[i + 1] = Math.floor(g * 255);
      data[i + 2] = Math.floor(b * 255);
      data[i + 3] = Math.floor(a * 255);
    }
  }

  ctx.putImageData(img, 0, 0);

  // Soften a touch to reduce pixel-y look when scaled (keep detail).
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 0.07;
  ctx.filter = 'blur(0.6px)';
  ctx.drawImage(canvas, 0, 0);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;

  milkyWayTextureCanvas = canvas;
  return canvas;
}

function getMilkyWayGalacticTextureData() {
  if (milkyWayTextureData) return milkyWayTextureData;
  const tex = getMilkyWayGalacticTextureCanvas();
  const ctx = tex.getContext('2d');
  if (!ctx) return null;
  const img = ctx.getImageData(0, 0, tex.width, tex.height);
  milkyWayTextureData = { w: tex.width, h: tex.height, data: img.data };
  return milkyWayTextureData;
}

function clamp01(t: number) {
  return Math.max(0, Math.min(1, t));
}

function wrap01(t: number) {
  let v = t % 1;
  if (v < 0) v += 1;
  return v;
}

function equatorialToGalactic(raDeg: number, decDeg: number) {
  // Convert equatorial (J2000) unit vector -> galactic via fixed rotation matrix.
  const ra = (raDeg * Math.PI) / 180;
  const dec = (decDeg * Math.PI) / 180;

  const x = Math.cos(dec) * Math.cos(ra);
  const y = Math.cos(dec) * Math.sin(ra);
  const z = Math.sin(dec);

  // Equatorial -> Galactic (J2000) matrix
  const gx = -0.0548755604 * x + -0.8734370902 * y + -0.4838350155 * z;
  const gy =  0.4941094279 * x + -0.4448296300 * y +  0.7469822445 * z;
  const gz = -0.8676661490 * x + -0.1980763734 * y +  0.4559837762 * z;

  const l = Math.atan2(gy, gx); // [-pi,pi]
  // IMPORTANT: gz is in [-1, 1]. Using clamp01() collapses negative latitudes and
  // produces visible warping artifacts (e.g. “rays”/streaks) in the Milky Way overlay.
  const b = Math.asin(Math.max(-1, Math.min(1, gz)));

  const lDeg = ((l * 180) / Math.PI + 360) % 360;
  const bDeg = (b * 180) / Math.PI;
  return { l: lDeg, b: bDeg };
}

function sampleBilinearEquirect(
  src: { w: number; h: number; data: Uint8ClampedArray },
  u: number,
  v: number
) {
  // u wraps, v clamps
  const uu = wrap01(u);
  const vv = clamp01(v);

  const x = uu * (src.w - 1);
  const y = vv * (src.h - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = (x0 + 1) % src.w;
  const y1 = Math.min(src.h - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;

  const i00 = (y0 * src.w + x0) * 4;
  const i10 = (y0 * src.w + x1) * 4;
  const i01 = (y1 * src.w + x0) * 4;
  const i11 = (y1 * src.w + x1) * 4;

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const lerp2 = (c00: number, c10: number, c01: number, c11: number) => {
    const a0 = lerp(c00, c10, tx);
    const a1 = lerp(c01, c11, tx);
    return lerp(a0, a1, ty);
  };

  return {
    r: lerp2(src.data[i00 + 0], src.data[i10 + 0], src.data[i01 + 0], src.data[i11 + 0]),
    g: lerp2(src.data[i00 + 1], src.data[i10 + 1], src.data[i01 + 1], src.data[i11 + 1]),
    b: lerp2(src.data[i00 + 2], src.data[i10 + 2], src.data[i01 + 2], src.data[i11 + 2]),
    a: lerp2(src.data[i00 + 3], src.data[i10 + 3], src.data[i01 + 3], src.data[i11 + 3]),
  };
}

function drawSunLensFlare(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sunScreen: { x: number; y: number; visible: boolean },
  sunAltitudeDeg: number,
  centerFactor: number,
  nightMode: boolean
) {
  if (!sunScreen.visible) return;

  // Flare should feel “camera-like”: strongest when Sun is up, minimal at night.
  const sunUp = clamp01((sunAltitudeDeg + 2) / 12); // ~0 below -2°, ~1 above 10°
  // Lens flare should mainly appear when you're actually looking at the Sun.
  const look = clamp01(centerFactor);
  const strength = sunUp * (0.35 + 0.65 * Math.pow(look, 1.6));
  if (strength <= 0.02) return;

  const cx = width / 2;
  const cy = height / 2;
  const sx = sunScreen.x;
  const sy = sunScreen.y;
  const dx = cx - sx;
  const dy = cy - sy;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.imageSmoothingEnabled = true;

  // Main bloom at the sun.
  const bloomR = Math.max(width, height) * (0.10 + 0.18 * strength);
  const bloom = ctx.createRadialGradient(sx, sy, 0, sx, sy, bloomR);
  if (nightMode) {
    bloom.addColorStop(0, `rgba(255, 140, 140, ${0.28 * strength})`);
    bloom.addColorStop(0.25, `rgba(255, 120, 120, ${0.16 * strength})`);
    bloom.addColorStop(1, 'rgba(255, 120, 120, 0)');
  } else {
    bloom.addColorStop(0, `rgba(255, 245, 190, ${0.34 * strength})`);
    bloom.addColorStop(0.25, `rgba(255, 220, 150, ${0.18 * strength})`);
    bloom.addColorStop(1, 'rgba(255, 210, 140, 0)');
  }
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, width, height);

  // “Ghost” elements along the optical axis.
  // Include some beyond the view center so the effect is obvious.
  const ghosts = [
    { t: 0.20, r: 0.020, a: 0.12 },
    { t: 0.42, r: 0.032, a: 0.10 },
    { t: 0.70, r: 0.022, a: 0.08 },
    { t: 1.05, r: 0.020, a: 0.10 },
    { t: 1.28, r: 0.030, a: 0.08 },
    { t: 1.55, r: 0.016, a: 0.07 },
  ];
  for (const g of ghosts) {
    const gx = sx + dx * g.t;
    const gy = sy + dy * g.t;
    const gr = Math.max(width, height) * g.r;
    const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
    if (nightMode) {
      gg.addColorStop(0, `rgba(255, 120, 120, ${g.a * strength})`);
      gg.addColorStop(0.6, `rgba(255, 120, 120, ${g.a * 0.35 * strength})`);
      gg.addColorStop(1, 'rgba(255, 120, 120, 0)');
    } else {
      gg.addColorStop(0, `rgba(255, 235, 170, ${g.a * strength})`);
      gg.addColorStop(0.6, `rgba(255, 235, 170, ${g.a * 0.35 * strength})`);
      gg.addColorStop(1, 'rgba(255, 235, 170, 0)');
    }
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(gx, gy, gr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Streak across the sun.
  const streakLen = Math.max(width, height) * (0.18 + 0.22 * strength);
  const streak = ctx.createLinearGradient(sx - streakLen, sy, sx + streakLen, sy);
  if (nightMode) {
    streak.addColorStop(0, 'rgba(255, 120, 120, 0)');
    streak.addColorStop(0.5, `rgba(255, 120, 120, ${0.10 * strength})`);
    streak.addColorStop(1, 'rgba(255, 120, 120, 0)');
  } else {
    streak.addColorStop(0, 'rgba(255, 235, 170, 0)');
    streak.addColorStop(0.5, `rgba(255, 235, 170, ${0.11 * strength})`);
    streak.addColorStop(1, 'rgba(255, 235, 170, 0)');
  }
  ctx.strokeStyle = streak;
  ctx.lineWidth = Math.max(1, Math.round(1 + 2.0 * strength));
  ctx.beginPath();
  ctx.moveTo(sx - streakLen, sy);
  ctx.lineTo(sx + streakLen, sy);
  ctx.stroke();

  // Secondary streak along the optical axis (center ↔ Sun).
  const axisLen = Math.max(width, height) * (0.30 + 0.28 * strength);
  const axisNorm = Math.max(1e-6, Math.hypot(dx, dy));
  const ax = dx / axisNorm;
  const ay = dy / axisNorm;
  const x1 = sx - ax * axisLen;
  const y1 = sy - ay * axisLen;
  const x2 = sx + ax * axisLen;
  const y2 = sy + ay * axisLen;
  const axis = ctx.createLinearGradient(x1, y1, x2, y2);
  if (nightMode) {
    axis.addColorStop(0, 'rgba(255, 120, 120, 0)');
    axis.addColorStop(0.5, `rgba(255, 120, 120, ${0.07 * strength})`);
    axis.addColorStop(1, 'rgba(255, 120, 120, 0)');
  } else {
    axis.addColorStop(0, 'rgba(255, 235, 170, 0)');
    axis.addColorStop(0.5, `rgba(255, 235, 170, ${0.08 * strength})`);
    axis.addColorStop(1, 'rgba(255, 235, 170, 0)');
  }
  ctx.strokeStyle = axis;
  ctx.lineWidth = Math.max(1, 1.5 + 2.5 * strength);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Subtle ring flare when looking close to the Sun.
  if (look > 0.55) {
    const ringR = Math.max(width, height) * (0.08 + 0.08 * strength);
    const ring = ctx.createRadialGradient(sx, sy, ringR * 0.35, sx, sy, ringR);
    if (nightMode) {
      ring.addColorStop(0, `rgba(255, 120, 120, 0)`);
      ring.addColorStop(0.55, `rgba(255, 120, 120, ${0.06 * strength})`);
      ring.addColorStop(1, 'rgba(255, 120, 120, 0)');
    } else {
      ring.addColorStop(0, `rgba(255, 235, 170, 0)`);
      ring.addColorStop(0.55, `rgba(255, 235, 170, ${0.07 * strength})`);
      ring.addColorStop(1, 'rgba(255, 235, 170, 0)');
    }
    ctx.strokeStyle = ring;
    ctx.lineWidth = Math.max(1, 2 * strength);
    ctx.beginPath();
    ctx.arc(sx, sy, ringR, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

let milkyWayWarpCanvas: HTMLCanvasElement | null = null;
let milkyWayWarpKey: string | null = null;

function drawMilkyWayWarped(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  location: ObserverLocation,
  currentTime: Date,
  viewAngle: { altitude: number; azimuth: number },
  fov: number,
  nightMode: boolean,
  showAtmosphere: boolean
) {
  const src = getMilkyWayGalacticTextureData();
  if (!src) return;

  // Visibility: fades out in twilight and with a bright Moon above horizon.
  const sunAlt = getSunPosition(currentTime, location).altitude;
  const twilight = clamp01((-sunAlt - 6) / 12); // 0 at -6°, 1 at -18°
  const moonNow = getMoonPosition(currentTime, location);
  const moonWash = clamp01(moonNow.illumination * 0.9) * clamp01((moonNow.altitude + 4) / 25);
  const mwVisibility = twilight * (1 - moonWash);
  const mwVisQ = Math.round(mwVisibility * 20) / 20; // stable cache key

  // Render at reduced resolution and scale up.
  // This is the heaviest CPU path in SkyViewer, so keep it fairly low-res.
  // Slightly higher than 1/5 with bilinear sampling gives a much less “blocky” look
  // while staying performant on most machines.
  const outW = Math.max(320, Math.floor(width / 3.8));
  const outH = Math.max(240, Math.floor(height / 3.8));

  // Heavy operation: keep stable for a while. Quantize in *simulated* time.
  // This avoids re-warping the Milky Way many times per second when timeSpeed is high.
  const tQuant = Math.floor(currentTime.getTime() / (30 * 60 * 1000)); // 30-min quantization
  // Coarser quantization reduces cache churn while panning.
  const altQ = Math.round(viewAngle.altitude * 2); // 0.5° steps
  const azQ = Math.round(viewAngle.azimuth * 2); // 0.5° steps
  const fovQ = Math.round(fov); // 1° steps
  const key = `${outW}x${outH}|${altQ}|${azQ}|${fovQ}|${Math.round(location.latitude * 100)}|${Math.round(location.longitude * 100)}|${tQuant}|${nightMode ? 1 : 0}|mw:${mwVisQ}|proc:${src.w}x${src.h}`;
  if (!milkyWayWarpCanvas || milkyWayWarpKey !== key) {
    if (!milkyWayWarpCanvas) milkyWayWarpCanvas = document.createElement('canvas');
    milkyWayWarpCanvas.width = outW;
    milkyWayWarpCanvas.height = outH;
    milkyWayWarpKey = key;

    const octx = milkyWayWarpCanvas.getContext('2d');
    if (!octx) return;
    const img = octx.createImageData(outW, outH);
    const out = img.data;

    const centerX = outW / 2;
    const centerY = outH / 2;
    const maxRadius = Math.hypot(outW, outH) / 2;
    const maxAngle = ((fov / 2) * Math.PI) / 180;

    const alt0 = (viewAngle.altitude * Math.PI) / 180;
    const az0 = (viewAngle.azimuth * Math.PI) / 180;

    for (let py = 0; py < outH; py++) {
      for (let px = 0; px < outW; px++) {
        const dx = px + 0.5 - centerX;
        const dy = py + 0.5 - centerY;
        const r = Math.hypot(dx, dy);
        const d = (r / maxRadius) * maxAngle;
        const i = (py * outW + px) * 4;

        if (d > maxAngle) {
          out[i + 3] = 0;
          continue;
        }

        // bearing: 0 at screen-up, clockwise
        const bearing = Math.atan2(dx, -dy);

        // Great-circle destination from (alt0, az0)
        const sinAlt = Math.sin(alt0) * Math.cos(d) + Math.cos(alt0) * Math.sin(d) * Math.cos(bearing);
        const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
        const y = Math.sin(bearing) * Math.sin(d) * Math.cos(alt0);
        const x = Math.cos(d) - Math.sin(alt0) * Math.sin(alt);
        const az = (az0 + Math.atan2(y, x) + Math.PI * 2) % (Math.PI * 2);

        const altDeg = (alt * 180) / Math.PI;
        const azDeg = (az * 180) / Math.PI;

        // Convert to RA/Dec (sky-locked)
        const eq = horizontalToEquatorial({ altitude: altDeg, azimuth: azDeg }, location, currentTime);
        const gal = equatorialToGalactic(eq.ra, eq.dec);

        // Sample galactic equirect texture
        const u = wrap01(gal.l / 360);
        const v = clamp01((90 - gal.b) / 180);
        const s = sampleBilinearEquirect(src, u, v);

        let sr = Math.round(s.r);
        let sg = Math.round(s.g);
        let sb = Math.round(s.b);
        let sa = Math.round(s.a);

        // Atmospheric fade near horizon for realism
        const haze = altDeg < 20 ? (altDeg <= -10 ? 0.2 : 0.2 + 0.8 * clamp01((altDeg + 10) / 30)) : 1;
        // Procedural texture already encodes intensity in its alpha. Keep it subtle so it
        // doesn't read as a large blown-out “white band”.
        const alphaScale = (nightMode ? 0.55 : 0.40) * haze * (0.15 + 0.85 * mwVisQ);
        sa = Math.floor(sa * alphaScale);

        out[i + 0] = sr;
        out[i + 1] = sg;
        out[i + 2] = sb;
        out[i + 3] = sa;
      }
    }

    octx.putImageData(img, 0, 0);
    // soften a touch
    octx.globalAlpha = 0.22;
    octx.globalCompositeOperation = 'source-over';
    octx.filter = 'blur(0.35px)';
    octx.drawImage(milkyWayWarpCanvas, 0, 0);
    octx.filter = 'none';
    octx.globalAlpha = 1;
  }

  ctx.save();
  // Stellarium-like feel:
  // - Atmosphere ON: Milky Way is more subdued and blends into sky glow.
  // - Atmosphere OFF: Milky Way pops more in deep space.
  ctx.globalCompositeOperation = 'screen';
  const baseAlpha = showAtmosphere
    ? (nightMode ? 0.22 : 0.16)
    : (nightMode ? 0.32 : 0.28);
  ctx.globalAlpha = baseAlpha * (0.15 + 0.85 * mwVisibility);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(milkyWayWarpCanvas, 0, 0, width, height);
  ctx.restore();
}

type SelectedObject =
  | {
      kind: 'star';
      id?: string | number;
      name: string;
      constellation?: string;
      magnitude: number;
      ra?: number;
      dec?: number;
      altitude: number;
      azimuth: number;
    }
  | {
      kind: 'constellation';
      name: string;
      altitude: number;
      azimuth: number;
    }
  | {
      kind: 'planet';
      name: string;
      magnitude?: number;
      distanceAu?: number;
      angularDiameterDeg?: number;
      altitude: number;
      azimuth: number;
    }
  | {
      kind: 'dso';
      name: string;
      messier?: string;
      ngc?: string;
      dsoType: string;
      magnitude: number;
      sizeArcmin: number;
      constellation?: string;
      ra?: number;
      dec?: number;
      altitude: number;
      azimuth: number;
    }
  | {
      kind: 'satellite';
      name: string;
      altitude: number;
      azimuth: number;
      rangeKm?: number;
      satnum?: number;
      inclinationDeg?: number;
      periodMin?: number;
      meanMotionRevPerDay?: number;
      group?: 'visual' | 'starlink';
    }
  | {
      kind: 'comet';
      name: string;
      packed?: string;
      altitude: number;
      azimuth: number;
      helioDistanceAu?: number;
      geoDistanceAu?: number;
      perihelionDistanceAu?: number;
      eccentricity?: number;
      perihelionTimeUtc?: string;
    }
  | {
      kind: 'body';
      name: 'Sun' | 'Moon';
      altitude: number;
      azimuth: number;
    };

interface SkyViewerProps {
  showConstellationLines?: boolean;
  showConstellationLabels?: boolean;
}

export default function SkyViewer({
  showConstellationLines = true,
  showConstellationLabels = true,
}: SkyViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const satellitesCanvasRef = useRef<HTMLCanvasElement>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const currentTimeRef = useRef<Date>(currentTime);
  const [location, setLocation] = useState<ObserverLocation>(getDefaultLocation());
  const [isPlaying, setIsPlaying] = useState(false);
  const [timeSpeed, setTimeSpeed] = useState(60); // 60x = 1 minute per second
  // Atmosphere feature removed: always render deep-space view.
  const showAtmosphere = false;
  const [showGrid, setShowGrid] = useState(false);
  const [showLabels, setShowLabels] = useState(showConstellationLabels);
  const [showLines, setShowLines] = useState(showConstellationLines); // Local state for lines
  const [nightMode, setNightMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedObject, setSelectedObject] = useState<SelectedObject | null>(null);
  const [wikiSummary, setWikiSummary] = useState<{ title: string; extract: string; url?: string; thumbnail?: string } | null>(null);
  const [wikiLoading, setWikiLoading] = useState(false);
  const [wikiError, setWikiError] = useState<string | null>(null);
  const resolvedStarKeyRef = useRef<string | null>(null);
  const [hoveredBody, setHoveredBody] = useState<'Sun' | 'Moon' | null>(null);
  const [viewAngle, setViewAngle] = useState({ altitude: 65, azimuth: 180 }); // Looking up at 65° for hemisphere view
  const [fov, setFov] = useState(120); // Wide field of view for fisheye effect
  const dragStartRef = useRef<{ x: number; y: number; altitude: number; azimuth: number } | null>(null);
  const dragMovedRef = useRef(false);
  const [showCrosshair, setShowCrosshair] = useState(true);
  const [fullStars, setFullStars] = useState<StarRecord[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [allConstellations, setAllConstellations] = useState<ConstellationLineSegment[]>([]);
  const [showDSOs, setShowDSOs] = useState(true); // Show deep sky objects
  const [showSatellites, setShowSatellites] = useState(false);
  const [satelliteGroup, setSatelliteGroup] = useState<'visual' | 'starlink'>('visual');
  const [satelliteTles, setSatelliteTles] = useState<SatelliteTLE[]>([]);
  const [satelliteLoading, setSatelliteLoading] = useState(false);
  const satelliteCacheRef = useRef<Record<string, SatelliteTLE[]>>({});
  const satelliteCompiledRef = useRef<Record<string, CompiledSatellite[]>>({});

  const [showComets, setShowComets] = useState(false);
  const [cometElements, setCometElements] = useState<CometElements[]>([]);
  const [cometLoading, setCometLoading] = useState(false);
  const cometCacheRef = useRef<CometElements[] | null>(null);
  const cometByPackedRef = useRef<Map<string, CometElements>>(new Map());

  const [manualBortleScale, setManualBortleScale] = useState(6);
  const [bortleMode, setBortleMode] = useState<'auto' | 'manual'>('auto');
  const [autoBortleScale, setAutoBortleScale] = useState(6);
  const [autoBortleLabel, setAutoBortleLabel] = useState<string>('');

  // If enabled, stars/DSOs are culled based on twilight/moon/Bortle/extinction.
  // Default OFF so the sky is never "empty" by surprise.
  const [realisticVisibility, setRealisticVisibility] = useState(false);

  // Location accuracy: prefer a saved location; otherwise request device location once.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const storageKey = 'stargazer.location';
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { latitude?: number; longitude?: number };
        if (typeof parsed?.latitude === 'number' && typeof parsed?.longitude === 'number') {
          setLocation({ latitude: parsed.latitude, longitude: parsed.longitude });
          return;
        }
      } catch {
        // ignore
      }
    }

    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setLocation(next);
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // ignore
        }
      },
      () => {
        // Permission denied / unavailable: keep default.
      },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 10 * 60 * 1000 }
    );
  }, []);


  const planetMarkersRef = useRef<Array<{
    name: string;
    x: number;
    y: number;
    radius: number;
    altitude: number;
    azimuth: number;
    magnitude?: number;
    distanceAu?: number;
    angularDiameterDeg?: number;
  }>>([]);
  const dsoMarkersRef = useRef<Array<{
    name: string;
    messier?: string;
    ngc?: string;
    dsoType: string;
    x: number;
    y: number;
    radius: number;
    altitude: number;
    azimuth: number;
    magnitude: number;
    sizeArcmin: number;
    constellation?: string;
    ra?: number;
    dec?: number;
  }>>([]);

  const satelliteMarkersRef = useRef<Array<{
    name: string;
    x: number;
    y: number;
    radius: number;
    altitude: number;
    azimuth: number;
    rangeKm?: number;
    satnum?: number;
    inclinationDeg?: number;
    periodMin?: number;
    meanMotionRevPerDay?: number;
  }>>([]);

  const satelliteVisibleRef = useRef<Map<string, boolean>>(new Map());

  const cometMarkersRef = useRef<Array<{
    name: string;
    packed: string;
    x: number;
    y: number;
    radius: number;
    altitude: number;
    azimuth: number;
    helioDistanceAu?: number;
    geoDistanceAu?: number;
    perihelionDistanceAu?: number;
    eccentricity?: number;
    perihelionTimeUtc?: string;
  }>>([]);

  const cometVisibleRef = useRef<Map<string, boolean>>(new Map());

  const sunMarkerRef = useRef<{
    x: number;
    y: number;
    visible: boolean;
    radius: number;
    altitude: number;
    azimuth: number;
  } | null>(null);
  const moonMarkerRef = useRef<{
    x: number;
    y: number;
    visible: boolean;
    radius: number;
    altitude: number;
    azimuth: number;
  } | null>(null);
  
  // Load full star catalog and all constellations on mount
  useEffect(() => {
    loadFullStarCatalog(6.0).then(stars => {
      setFullStars(stars);
      setCatalogLoading(false);
      console.log(`Sky viewer loaded ${stars.length} stars`);
    });
    
    // Load all 88 constellation line patterns
    const segments = getConstellationLineSegments();
    setAllConstellations(segments);
    console.log(`Loaded ${segments.length} constellations`);
  }, []);

  // Bortle scale: persisted via dashboard slider.
  useEffect(() => {
    const key = 'stargazer.bortleScale';
    const read = () => {
      try {
        const raw = localStorage.getItem(key);
        const parsed = raw ? Number(raw) : NaN;
        if (Number.isFinite(parsed)) {
          setManualBortleScale(Math.max(1, Math.min(9, Math.round(parsed))));
        }
      } catch {
        // ignore
      }
    };

    read();

    const onCustom = (e: any) => {
      const v = Number(e?.detail);
      if (Number.isFinite(v)) setManualBortleScale(Math.max(1, Math.min(9, Math.round(v))));
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) read();
    };

    window.addEventListener('stargazer:bortleScale', onCustom as EventListener);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('stargazer:bortleScale', onCustom as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // Persist & restore Bortle mode and realistic visibility.
  useEffect(() => {
    try {
      const modeRaw = localStorage.getItem('stargazer.bortleMode');
      if (modeRaw === 'auto' || modeRaw === 'manual') setBortleMode(modeRaw);
      const rvRaw = localStorage.getItem('stargazer.realisticVisibility');
      if (rvRaw === '1' || rvRaw === '0') setRealisticVisibility(rvRaw === '1');
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('stargazer.bortleMode', bortleMode);
    } catch {
      // ignore
    }
  }, [bortleMode]);

  useEffect(() => {
    try {
      localStorage.setItem('stargazer.realisticVisibility', realisticVisibility ? '1' : '0');
    } catch {
      // ignore
    }
  }, [realisticVisibility]);

  // Auto Bortle estimate based on current location.
  useEffect(() => {
    const est = estimateBortleScaleForLocation(location.latitude, location.longitude);
    setAutoBortleScale(est.bortle);
    if (est.nearestCity && typeof est.distanceKm === 'number') {
      setAutoBortleLabel(`${est.nearestCity} (${est.distanceKm.toFixed(0)} km)`);
    } else if (est.nearestCity) {
      setAutoBortleLabel(est.nearestCity);
    } else {
      setAutoBortleLabel('');
    }
  }, [location.latitude, location.longitude]);

  const effectiveBortleScale = bortleMode === 'auto' ? autoBortleScale : manualBortleScale;
  
  // Calculate star positions based on current time and location
  const starPositions = calculateStarPositions(constellationStars, location, currentTime);
  
  // Calculate positions for all real-time stars
  const fullStarPositions = calculateStarPositions(fullStars as any, location, currentTime);

  // Load satellite TLEs when satellites are enabled
  useEffect(() => {
    if (!showSatellites) return;

    const cached = satelliteCacheRef.current[satelliteGroup];
    if (cached && cached.length > 0) {
      setSatelliteTles(cached);
      return;
    }

    const controller = new AbortController();
    setSatelliteLoading(true);
    fetch(`/api/satellites?group=${encodeURIComponent(satelliteGroup)}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || `Satellite TLE fetch failed (${res.status})`);
        }
        return res.json();
      })
      .then((data) => {
        const sats = Array.isArray(data?.satellites) ? data.satellites : [];
        const cleaned: SatelliteTLE[] = sats
          .map((s: any) => ({ name: String(s?.name || ''), line1: String(s?.line1 || ''), line2: String(s?.line2 || '') }))
          .filter((s: SatelliteTLE) => s.name && s.line1.startsWith('1 ') && s.line2.startsWith('2 '))
          .slice(0, satelliteGroup === 'starlink' ? 3000 : 250);
        satelliteCacheRef.current[satelliteGroup] = cleaned;
        setSatelliteTles(cleaned);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        console.warn('Failed to load satellites:', err);
      })
      .finally(() => {
        setSatelliteLoading(false);
      });

    return () => controller.abort();
  }, [showSatellites, satelliteGroup]);

  // Load comet orbital elements when comets are enabled
  useEffect(() => {
    if (!showComets) return;

    if (cometCacheRef.current && cometCacheRef.current.length > 0) {
      setCometElements(cometCacheRef.current);
      return;
    }

    const controller = new AbortController();
    setCometLoading(true);
    fetch('/api/comets?limit=250', { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || `Comet elements fetch failed (${res.status})`);
        }
        return res.json();
      })
      .then((data) => {
        const comets = Array.isArray(data?.comets) ? (data.comets as CometElements[]) : [];
        const cleaned = comets
          .map((c: any) => ({
            packed: String(c?.packed || ''),
            name: String(c?.name || c?.packed || ''),
            perihelionTimeUtc: String(c?.perihelionTimeUtc || ''),
            perihelionDistanceAu: Number(c?.perihelionDistanceAu),
            eccentricity: Number(c?.eccentricity),
            argPerihelionDeg: Number(c?.argPerihelionDeg),
            ascNodeDeg: Number(c?.ascNodeDeg),
            inclinationDeg: Number(c?.inclinationDeg),
            epochYmd: typeof c?.epochYmd === 'string' ? c.epochYmd : undefined,
            magnitudeG: typeof c?.magnitudeG === 'number' ? c.magnitudeG : null,
            magnitudeK: typeof c?.magnitudeK === 'number' ? c.magnitudeK : null,
          }))
          .filter((c: CometElements) =>
            c.packed &&
            c.name &&
            Number.isFinite(c.perihelionDistanceAu) &&
            Number.isFinite(c.eccentricity) &&
            Number.isFinite(c.argPerihelionDeg) &&
            Number.isFinite(c.ascNodeDeg) &&
            Number.isFinite(c.inclinationDeg)
          )
          .slice(0, 250);

        cometCacheRef.current = cleaned;
        cometByPackedRef.current = new Map(cleaned.map((c) => [c.packed, c]));
        setCometElements(cleaned);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        console.warn('Failed to load comets:', err);
      })
      .finally(() => {
        setCometLoading(false);
      });

    return () => controller.abort();
  }, [showComets]);

  // Compile satrecs once per group to keep animation/camera moves fast.
  useEffect(() => {
    if (!showSatellites) return;
    if (satelliteTles.length === 0) return;
    satelliteCompiledRef.current[satelliteGroup] = compileTles(satelliteTles);
  }, [showSatellites, satelliteGroup, satelliteTles]);

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const satCanvas = satellitesCanvasRef.current;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const satCtx = satCanvas?.getContext('2d') || null;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      if (satCanvas) {
        satCanvas.width = window.innerWidth;
        satCanvas.height = window.innerHeight;
      }
    };
    resize();
    window.addEventListener('resize', resize);

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;

      // Clear canvas
      ctx.fillStyle = nightMode ? '#200000' : '#000510';
      ctx.fillRect(0, 0, width, height);

      // Sky texture (Milky Way is sky-locked + time-accurate)
      drawSkyTexture(ctx, width, height, location, currentTime, viewAngle, fov, nightMode, showAtmosphere);

      // Space contrast: make the background a touch darker before bright objects.
      // This is intentionally subtle to avoid crushing the atmosphere gradients.
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
      ctx.restore();

      // Draw grid if enabled
      if (showGrid) {
        drawGrid(ctx, width, height, viewAngle, fov);
      }

      // Star bloom: draw stars to a downscaled offscreen buffer, blur + screen it onto the main canvas.
      if (fullStars.length > 0) {
        const bloomScale = 0.5;
        const bw = Math.max(320, Math.floor(width * bloomScale));
        const bh = Math.max(240, Math.floor(height * bloomScale));
        const bCanvas = getStarBloomCanvas(bw, bh);
        const bctx = bCanvas.getContext('2d');
        if (bctx) {
          bctx.clearRect(0, 0, bw, bh);
          drawAllStars(
            bctx,
            bw,
            bh,
            location,
            currentTime,
            fullStarPositions,
            fullStars,
            viewAngle,
            fov,
            nightMode,
            effectiveBortleScale,
            realisticVisibility,
            { bloomPass: true }
          );

          ctx.save();
          ctx.imageSmoothingEnabled = true;
          ctx.globalCompositeOperation = 'screen';

          // Two blur radii: wide soft glow + tighter halo.
          ctx.globalAlpha = nightMode ? 0.55 : 0.65;
          ctx.filter = 'blur(10px)';
          ctx.drawImage(bCanvas, 0, 0, width, height);

          ctx.globalAlpha = nightMode ? 0.35 : 0.45;
          ctx.filter = 'blur(4px)';
          ctx.drawImage(bCanvas, 0, 0, width, height);

          ctx.filter = 'none';
          ctx.restore();
        }
      }

      // Draw sharp stars on top
      if (fullStars.length > 0) {
        drawAllStars(
          ctx,
          width,
          height,
          location,
          currentTime,
          fullStarPositions,
          fullStars,
          viewAngle,
          fov,
          nightMode,
          effectiveBortleScale,
          realisticVisibility
        );
      }

      // Draw deep sky objects (galaxies, nebulae, clusters)
      if (showDSOs) {
        const nextDsoMarkers: Array<{
          name: string;
          messier?: string;
          ngc?: string;
          dsoType: string;
          x: number;
          y: number;
          radius: number;
          altitude: number;
          azimuth: number;
          magnitude: number;
          sizeArcmin: number;
          constellation?: string;
          ra?: number;
          dec?: number;
        }> = [];
        drawDeepSkyObjects(
          ctx,
          width,
          height,
          location,
          currentTime,
          viewAngle,
          fov,
          nightMode,
          effectiveBortleScale,
          realisticVisibility,
          nextDsoMarkers
        );
        dsoMarkersRef.current = nextDsoMarkers;
      } else {
        dsoMarkersRef.current = [];
      }

      // Draw planets (including Pluto)
      const nextPlanetMarkers: Array<{
        name: string;
        x: number;
        y: number;
        radius: number;
        altitude: number;
        azimuth: number;
        magnitude?: number;
        distanceAu?: number;
        angularDiameterDeg?: number;
      }> = [];
      drawPlanets(ctx, width, height, location, currentTime, viewAngle, fov, nightMode, nextPlanetMarkers);
      planetMarkersRef.current = nextPlanetMarkers;

      // Satellites are rendered on a lightweight overlay canvas for smooth animation.

      // Draw Sun/Moon markers always; show paths only when hovered/selected
      const showSunPath = hoveredBody === 'Sun' || (selectedObject?.kind === 'body' && selectedObject.name === 'Sun');
      const showMoonPath = hoveredBody === 'Moon' || (selectedObject?.kind === 'body' && selectedObject.name === 'Moon');
      drawSunMoon(ctx, width, height, location, currentTime, viewAngle, fov, nightMode, {
        showSunPath,
        showMoonPath,
        sunMarkerRef,
        moonMarkerRef,
      });

      // Draw constellation stars (brighter, for labels/lines)
      // drawStars(ctx, width, height, starPositions, viewAngle, fov, nightMode);

      // Draw constellation lines from all 88 constellations
      if (showLines && allConstellations.length > 0) {
        drawAllConstellationLines(ctx, canvas.width, canvas.height, allConstellations, location, currentTime, viewAngle, fov, nightMode);
      }

      // Draw constellation labels
      if (showLabels && allConstellations.length > 0) {
        drawAllConstellationLabels(ctx, canvas.width, canvas.height, allConstellations, location, currentTime, viewAngle, fov, nightMode);
      }

      // Draw a clear horizon line and cardinal directions (no landscape mode)
      drawHorizonLine(ctx, width, height, viewAngle, fov, nightMode);
      drawCardinalDirections(ctx, width, height, viewAngle, fov, nightMode);

      // Draw center crosshair
      if (showCrosshair) {
        drawCrosshair(ctx, width, height, nightMode);
      }

      // Draw FOV indicator
      drawFOVIndicator(ctx, width, height, fov, nightMode);
    };

    render();

    return () => {
      window.removeEventListener('resize', resize);
    };
  }, [starPositions, fullStarPositions, fullStars, showLines, viewAngle, nightMode, showGrid, showLabels, showCrosshair, fov, allConstellations, location, currentTime, showDSOs, hoveredBody, selectedObject, effectiveBortleScale, realisticVisibility]);

  // Keep a ref for currentTime to allow smooth satellite animation without re-rendering the whole sky.
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);



  // Satellites + comets are drawn on a lightweight overlay canvas so they animate smoothly.
  // Satellites use real wall-clock time ("realtime satellites"). Comets use a stylized time-warp to make motion visible.
  useEffect(() => {
    if (!showSatellites && !showComets) {
      satelliteMarkersRef.current = [];
      cometMarkersRef.current = [];
      satelliteVisibleRef.current.clear();
      cometVisibleRef.current.clear();
      const satCanvas = satellitesCanvasRef.current;
      const satCtx = satCanvas?.getContext('2d') || null;
      if (satCtx && satCanvas) satCtx.clearRect(0, 0, satCanvas.width, satCanvas.height);
      return;
    }

    const satCanvas = satellitesCanvasRef.current;
    const satCtx = satCanvas?.getContext('2d') || null;
    if (!satCanvas || !satCtx) return;

    let raf = 0;
    let lastDrawMs = 0;

    const loop = (nowMs: number) => {
      raf = requestAnimationFrame(loop);

      // Keep overlay smooth but avoid unnecessary churn.
      const frameMs = satelliteGroup === 'starlink' ? 50 : 33;
      if (nowMs - lastDrawMs < frameMs) return;
      lastDrawMs = nowMs;

      satCtx.clearRect(0, 0, satCanvas.width, satCanvas.height);

      // 1) Satellites (real time)
      if (showSatellites) {
        const tSat = new Date();
        const compiled = satelliteCompiledRef.current[satelliteGroup];
        if (compiled && compiled.length > 0) {
          const nextSatMarkers: Array<{
            name: string;
            x: number;
            y: number;
            radius: number;
            altitude: number;
            azimuth: number;
            rangeKm?: number;
            satnum?: number;
            inclinationDeg?: number;
            periodMin?: number;
            meanMotionRevPerDay?: number;
          }> = [];

          drawSatellites(
            satCtx,
            satCanvas.width,
            satCanvas.height,
            location,
            tSat,
            viewAngle,
            fov,
            nightMode,
            satelliteGroup,
            compiled,
            nextSatMarkers,
            satelliteVisibleRef.current,
          );

          satelliteMarkersRef.current = nextSatMarkers;
        } else {
          satelliteMarkersRef.current = [];
          satelliteVisibleRef.current.clear();
        }
      } else {
        satelliteMarkersRef.current = [];
        satelliteVisibleRef.current.clear();
      }

      // 2) Comets (overlay mechanics, but driven by simulation time so they move with timelapse)
      if (showComets && cometElements.length > 0) {
        const cometTime = currentTimeRef.current;

        const sun = getSunPosition(cometTime, location);
        const sunScreen = projectToScreen(sun.altitude, sun.azimuth, satCanvas.width, satCanvas.height, viewAngle, fov);

        // Stable subset to avoid visual "teleporting" when the list is large.
        // In real skies, only a few comets are meaningfully visible; keep it bounded.
        const MAX_COMETS = 120;
        const pickEven = <T,>(arr: T[], n: number): T[] => {
          if (arr.length <= n) return arr;
          const stride = Math.max(1, Math.floor(arr.length / n));
          const out: T[] = [];
          for (let i = 0; i < arr.length && out.length < n; i += stride) out.push(arr[i]);
          for (let i = 0; i < arr.length && out.length < n; i += 1) out.push(arr[i]);
          return out.slice(0, n);
        };

        const sampledElements = pickEven(cometElements, MAX_COMETS);
        const positions = computeCometHorizontalPositions(sampledElements, cometTime, location);
        const nextCometMarkers: Array<{
          name: string;
          packed: string;
          x: number;
          y: number;
          radius: number;
          altitude: number;
          azimuth: number;
          helioDistanceAu?: number;
          geoDistanceAu?: number;
          perihelionDistanceAu?: number;
          eccentricity?: number;
          perihelionTimeUtc?: string;
        }> = [];

        drawComets(
          satCtx,
          satCanvas.width,
          satCanvas.height,
          positions,
          viewAngle,
          fov,
          nightMode,
          { altitude: sun.altitude, azimuth: sun.azimuth },
          cometByPackedRef.current,
          cometVisibleRef.current,
          nextCometMarkers,
        );

        cometMarkersRef.current = nextCometMarkers;
      } else {
        cometMarkersRef.current = [];
        cometVisibleRef.current.clear();
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [showSatellites, satelliteGroup, showComets, cometElements, location, viewAngle, fov, nightMode, satelliteTles]);

  // Time animation
  useEffect(() => {
    if (!isPlaying) return;

    // timeSpeed is a multiplier (e.g. 60× = 60 seconds of simulation per 1 second of real time).
    // Advance by (intervalMs * timeSpeed) to keep the control accurate and reduce needless churn.
    const intervalMs = 150;
    const interval = setInterval(() => {
      setCurrentTime(prevTime => new Date(prevTime.getTime() + timeSpeed * intervalMs));
    }, intervalMs);

    return () => clearInterval(interval);
  }, [isPlaying, timeSpeed]);

  // Mouse drag to rotate view
  const handleMouseDown = (e: React.MouseEvent) => {
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      altitude: viewAngle.altitude,
      azimuth: viewAngle.azimuth,
    };
    dragMovedRef.current = false;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Hover detection (only when not dragging)
    if (!dragStartRef.current) {
      const sun = sunMarkerRef.current;
      const moon = moonMarkerRef.current;

      const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy);
      };

      const hitPadding = 10;
      const sunHit = sun && sun.visible ? dist({ x, y }, sun) <= sun.radius + hitPadding : false;
      const moonHit = moon && moon.visible ? dist({ x, y }, moon) <= moon.radius + hitPadding : false;

      const nextHover: 'Sun' | 'Moon' | null = sunHit ? 'Sun' : moonHit ? 'Moon' : null;
      if (nextHover !== hoveredBody) setHoveredBody(nextHover);
      return;
    }

    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    if (Math.abs(dx) + Math.abs(dy) > 4) {
      dragMovedRef.current = true;
    }

    const sensitivity = 0.3;
    const newAltitude = Math.max(-90, Math.min(90, dragStartRef.current.altitude + dy * sensitivity));
    const newAzimuth = (dragStartRef.current.azimuth - dx * sensitivity + 360) % 360;

    setViewAngle({ altitude: newAltitude, azimuth: newAzimuth });
  };

  const handleMouseUp = () => {
    dragStartRef.current = null;
  };

  // Handle mouse wheel for FOV zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY * 0.1;
    setFov(prev => Math.max(30, Math.min(120, prev + delta)));
  };

  // Handle canvas click for star selection
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragMovedRef.current) return; // Don't select if this was a drag

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // 0) Sun/Moon selection (enables path on click)
    const sun = sunMarkerRef.current;
    if (sun && sun.visible) {
      const d = Math.hypot(sun.x - clickX, sun.y - clickY);
      if (d <= sun.radius + 10) {
        setSelectedObject({ kind: 'body', name: 'Sun', altitude: sun.altitude, azimuth: sun.azimuth });
        return;
      }
    }
    const moon = moonMarkerRef.current;
    if (moon && moon.visible) {
      const d = Math.hypot(moon.x - clickX, moon.y - clickY);
      if (d <= moon.radius + 10) {
        setSelectedObject({ kind: 'body', name: 'Moon', altitude: moon.altitude, azimuth: moon.azimuth });
        return;
      }
    }

    // 0b) Planets
    {
      let best: (typeof planetMarkersRef.current)[number] | null = null;
      let bestD = 1e9;
      for (const p of planetMarkersRef.current) {
        const d = Math.hypot(p.x - clickX, p.y - clickY);
        const hitR = Math.max(10, p.radius + 8);
        if (d <= hitR && d < bestD) {
          bestD = d;
          best = p;
        }
      }
      if (best) {
        setSelectedObject({
          kind: 'planet',
          name: best.name,
          magnitude: best.magnitude,
          distanceAu: best.distanceAu,
          angularDiameterDeg: best.angularDiameterDeg,
          altitude: best.altitude,
          azimuth: best.azimuth,
        });
        return;
      }
    }

    // 0c) Deep-sky objects (nebulae/galaxies/clusters)
    {
      let best: (typeof dsoMarkersRef.current)[number] | null = null;
      let bestD = 1e9;
      for (const dso of dsoMarkersRef.current) {
        const d = Math.hypot(dso.x - clickX, dso.y - clickY);
        const hitR = Math.max(12, dso.radius + 10);
        if (d <= hitR && d < bestD) {
          bestD = d;
          best = dso;
        }
      }
      if (best) {
        setSelectedObject({
          kind: 'dso',
          name: best.name,
          messier: best.messier,
          ngc: best.ngc,
          dsoType: best.dsoType,
          magnitude: best.magnitude,
          sizeArcmin: best.sizeArcmin,
          constellation: best.constellation,
          ra: best.ra,
          dec: best.dec,
          altitude: best.altitude,
          azimuth: best.azimuth,
        });
        return;
      }
    }

    // 0d) Satellites
    {
      let best: (typeof satelliteMarkersRef.current)[number] | null = null;
      let bestD = 1e9;
      for (const s of satelliteMarkersRef.current) {
        const d = Math.hypot(s.x - clickX, s.y - clickY);
        const hitR = Math.max(10, s.radius + 10);
        if (d <= hitR && d < bestD) {
          bestD = d;
          best = s;
        }
      }
      if (best) {
        setSelectedObject({
          kind: 'satellite',
          name: best.name,
          altitude: best.altitude,
          azimuth: best.azimuth,
          rangeKm: best.rangeKm,
          satnum: best.satnum,
          inclinationDeg: best.inclinationDeg,
          periodMin: best.periodMin,
          meanMotionRevPerDay: best.meanMotionRevPerDay,
          group: satelliteGroup,
        });
        return;
      }
    }

    // 0e) Comets
    {
      let best: (typeof cometMarkersRef.current)[number] | null = null;
      let bestD = 1e9;
      for (const c of cometMarkersRef.current) {
        const d = Math.hypot(c.x - clickX, c.y - clickY);
        const hitR = Math.max(10, c.radius + 10);
        if (d <= hitR && d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (best) {
        setSelectedObject({
          kind: 'comet',
          name: best.name,
          packed: best.packed,
          altitude: best.altitude,
          azimuth: best.azimuth,
          helioDistanceAu: best.helioDistanceAu,
          geoDistanceAu: best.geoDistanceAu,
          perihelionDistanceAu: best.perihelionDistanceAu,
          eccentricity: best.eccentricity,
          perihelionTimeUtc: best.perihelionTimeUtc,
        });
        return;
      }
    }

    // 1) Find closest named constellation star
    let closestStar: SelectedObject | null = null;
    let closestDist = MAX_CLICK_DIST_PX;

    constellationStars.forEach((star, index) => {
      const pos = starPositions[index];
      if (pos.altitude < MIN_RENDER_ALTITUDE_DEG) return;

      const screen = projectToScreen(pos.altitude, pos.azimuth, canvas.width, canvas.height, viewAngle, fov);
      if (!screen.visible) return;

      const dist = Math.sqrt(Math.pow(screen.x - clickX, 2) + Math.pow(screen.y - clickY, 2));
      if (dist < closestDist) {
        closestDist = dist;
        closestStar = {
          kind: 'star',
          id: star.id,
          name: star.name,
          constellation: star.constellation,
          magnitude: star.mag,
          ra: star.ra,
          dec: star.dec,
          altitude: pos.altitude,
          azimuth: pos.azimuth,
        };
      }
    });

    if (closestStar) {
      setSelectedObject(closestStar);
      return;
    }

    // 1b) Otherwise, find closest *catalog* star (most stars are unnamed in the dataset).
    // This enables clicking any rendered star and getting its catalog ID + coordinates.
    let closestCatalogStar: SelectedObject | null = null;
    let closestCatalogDist = MAX_CLICK_DIST_PX;
    for (let index = 0; index < fullStars.length; index++) {
      const star = fullStars[index];
      const pos = fullStarPositions[index];
      if (!pos || pos.altitude < MIN_RENDER_ALTITUDE_DEG) continue;

      const screen = projectToScreen(pos.altitude, pos.azimuth, canvas.width, canvas.height, viewAngle, fov);
      if (!screen.visible) continue;

      const dist = Math.hypot(screen.x - clickX, screen.y - clickY);
      if (dist < closestCatalogDist) {
        closestCatalogDist = dist;
        const id = star.id;
        const name = star.name?.trim() ? star.name : `Star ${String(id)}`;
        closestCatalogStar = {
          kind: 'star',
          id,
          name,
          constellation: star.constellation,
          magnitude: star.mag,
          ra: star.ra,
          dec: star.dec,
          altitude: pos.altitude,
          azimuth: pos.azimuth,
        };
      }
    }

    if (closestCatalogStar) {
      setSelectedObject(closestCatalogStar);
      return;
    }

    // 2) Otherwise, try selecting a constellation by clicking near its lines
    let closestConstellation: SelectedObject | null = null;
    let bestLineDist = MAX_CONSTELLATION_CLICK_DIST_PX;

    for (const constellation of allConstellations) {
      for (const line of constellation.lines) {
        if (line.points.length < 2) continue;

        for (let i = 1; i < line.points.length; i++) {
          const p1 = line.points[i - 1];
          const p2 = line.points[i];

          const ra1 = p1.lon < 0 ? p1.lon + 360 : p1.lon;
          const dec1 = p1.lat;
          const ra2 = p2.lon < 0 ? p2.lon + 360 : p2.lon;
          const dec2 = p2.lat;

          const h1 = equatorialToHorizontal({ ra: ra1, dec: dec1 }, location, currentTime);
          const h2 = equatorialToHorizontal({ ra: ra2, dec: dec2 }, location, currentTime);

          if (h1.altitude < MIN_RENDER_ALTITUDE_DEG && h2.altitude < MIN_RENDER_ALTITUDE_DEG) continue;

          const s1 = projectToScreen(h1.altitude, h1.azimuth, canvas.width, canvas.height, viewAngle, fov);
          const s2 = projectToScreen(h2.altitude, h2.azimuth, canvas.width, canvas.height, viewAngle, fov);
          if (!s1.visible || !s2.visible) continue;

          const dist = distancePointToSegment(clickX, clickY, s1.x, s1.y, s2.x, s2.y);
          if (dist < bestLineDist) {
            bestLineDist = dist;
            closestConstellation = {
              kind: 'constellation',
              name: constellation.name,
              altitude: (h1.altitude + h2.altitude) / 2,
              azimuth: (h1.azimuth + h2.azimuth) / 2,
            };
          }
        }
      }
    }

    setSelectedObject(closestConstellation);
  };

  // Resolve selected stars to a real identifier/name using SIMBAD (by RA/Dec).
  // This upgrades placeholder "Star <id>" labels into real designations.
  useEffect(() => {
    if (!selectedObject) {
      resolvedStarKeyRef.current = null;
      return;
    }

    if (selectedObject.kind !== 'star') {
      resolvedStarKeyRef.current = null;
      return;
    }

    if (typeof selectedObject.ra !== 'number' || typeof selectedObject.dec !== 'number') return;

    const key = `${selectedObject.ra.toFixed(5)},${selectedObject.dec.toFixed(5)}`;
    if (resolvedStarKeyRef.current === key) return;
    resolvedStarKeyRef.current = key;

    const controller = new AbortController();
    fetch(`/api/star-resolve?ra=${encodeURIComponent(String(selectedObject.ra))}&dec=${encodeURIComponent(String(selectedObject.dec))}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || `Star resolve failed (${res.status})`);
        return data;
      })
      .then((data) => {
        const bestName = data?.result?.bestName;
        if (typeof bestName !== 'string' || !bestName.trim()) return;

        setSelectedObject((prev) => {
          if (!prev || prev.kind !== 'star') return prev;
          if (typeof prev.ra !== 'number' || typeof prev.dec !== 'number') return prev;
          const prevKey = `${prev.ra.toFixed(5)},${prev.dec.toFixed(5)}`;
          if (prevKey !== key) return prev;

          const currentName = prev.name?.trim() || '';
          const isPlaceholder = /^Star\s+\d+$/i.test(currentName);
          if (!isPlaceholder) return prev;

          return { ...prev, name: bestName.trim() };
        });
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
      });

    return () => controller.abort();
  }, [selectedObject]);

  // Fetch Wikipedia summary for selected objects when a usable title is available.
  useEffect(() => {
    setWikiSummary(null);
    setWikiError(null);

    if (!selectedObject) return;

    const name = (selectedObject as any).name?.trim?.() || '';
    if (!name) return;

    const kindParam = selectedObject.kind === 'star'
      ? 'star'
      : selectedObject.kind === 'planet'
        ? 'planet'
        : selectedObject.kind === 'dso'
          ? 'dso'
          : selectedObject.kind === 'body'
            ? 'body'
            : selectedObject.kind === 'comet'
              ? 'comet'
            : '';

    // Most stars in stars.6.json don't include a proper/common name.
    // For those, try a best-effort catalog lookup using HIP <id> (often the dataset id).
    // If it doesn't exist on Wikipedia, we'll just show no summary.
    let wikiQuery = name;
    if (selectedObject.kind === 'star') {
      const isUnnamedCatalog = /^Star\s+\d+$/i.test(name);
      wikiQuery = isUnnamedCatalog && typeof selectedObject.id === 'number'
        ? `HIP ${selectedObject.id}`
        : name;
      // If it's unnamed but we don't have a numeric id, there's nothing reasonable to search.
      if (isUnnamedCatalog && !wikiQuery) return;
    }

    const controller = new AbortController();
    setWikiLoading(true);
    fetch(`/api/wiki-summary?q=${encodeURIComponent(wikiQuery)}&kind=${encodeURIComponent(kindParam)}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || `Wikipedia lookup failed (${res.status})`);
        }
        return res.json();
      })
      .then((data) => {
        setWikiSummary({
          title: data.title,
          extract: data.extract,
          url: data.url,
          thumbnail: data.thumbnail,
        });
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setWikiError(String(err?.message || err));
      })
      .finally(() => {
        setWikiLoading(false);
      });

    return () => controller.abort();
  }, [selectedObject]);

  type SearchResult = {
    kind: 'star' | 'constellation' | 'body' | 'planet' | 'dso';
    title: string;
    subtitle: string;
    onSelect: () => void;
  };

  const searchResults = useMemo<SearchResult[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];

    const results: SearchResult[] = [];
    const limit = 12;
    const push = (r: SearchResult) => {
      if (results.length < limit) results.push(r);
    };

    // 1) Heavenly bodies: Sun/Moon
    if ('sun'.includes(q) || q.includes('sun')) {
      const sun = getSunPosition(currentTime, location);
      push({
        kind: 'body',
        title: 'Sun',
        subtitle: 'Body',
        onSelect: () => {
          setViewAngle({ altitude: sun.altitude, azimuth: sun.azimuth });
          setSelectedObject({ kind: 'body', name: 'Sun', altitude: sun.altitude, azimuth: sun.azimuth });
          setSearchQuery('');
        },
      });
    }
    if ('moon'.includes(q) || q.includes('moon')) {
      const moon = getMoonPosition(currentTime, location);
      push({
        kind: 'body',
        title: 'Moon',
        subtitle: 'Body',
        onSelect: () => {
          setViewAngle({ altitude: moon.altitude, azimuth: moon.azimuth });
          setSelectedObject({ kind: 'body', name: 'Moon', altitude: moon.altitude, azimuth: moon.azimuth });
          setSearchQuery('');
        },
      });
    }

    // 2) Planets
    for (const p of getPlanetHorizontalPositions(currentTime, location)) {
      if (results.length >= limit) break;
      const name = p.name.toLowerCase();
      if (!name.includes(q)) continue;
      push({
        kind: 'planet',
        title: p.name,
        subtitle: `Planet · Mag ${p.magnitude.toFixed(1)}`,
        onSelect: () => {
          setViewAngle({ altitude: p.altitude, azimuth: p.azimuth });
          setSelectedObject({
            kind: 'planet',
            name: p.name,
            magnitude: p.magnitude,
            distanceAu: p.distanceAu,
            angularDiameterDeg: p.angularDiameterDeg,
            altitude: p.altitude,
            azimuth: p.azimuth,
          });
          setSearchQuery('');
        },
      });
    }

    // 3) Deep-sky objects (nebulae/galaxies/clusters)
    for (const dso of deepSkyObjects) {
      if (results.length >= limit) break;
      const hay = `${dso.name} ${dso.messier ?? ''} ${dso.ngc ?? ''} ${dso.constellation} ${dso.type}`.toLowerCase();
      if (!hay.includes(q)) continue;
      const horiz = equatorialToHorizontal({ ra: dso.ra, dec: dso.dec }, location, currentTime);
      push({
        kind: 'dso',
        title: dso.messier ? `${dso.messier} ${dso.name}` : dso.name,
        subtitle: `${dso.type.replace('-', ' ')} · ${dso.constellation} · Mag ${dso.magnitude.toFixed(1)}`,
        onSelect: () => {
          setViewAngle({ altitude: horiz.altitude, azimuth: horiz.azimuth });
          setSelectedObject({
            kind: 'dso',
            name: dso.name,
            messier: dso.messier,
            ngc: dso.ngc,
            dsoType: dso.type,
            magnitude: dso.magnitude,
            sizeArcmin: dso.size,
            constellation: dso.constellation,
            ra: dso.ra,
            dec: dso.dec,
            altitude: horiz.altitude,
            azimuth: horiz.azimuth,
          });
          setSearchQuery('');
        },
      });
    }

    // 4) Constellations
    for (const c of allConstellations) {
      if (results.length >= limit) break;
      const hay = `${c.name} ${c.id}`.toLowerCase();
      if (!hay.includes(q)) continue;
      push({
        kind: 'constellation',
        title: c.name,
        subtitle: 'Constellation',
        onSelect: () => {
          const pt = c.lines?.[0]?.points?.[0];
          if (pt) {
            const ra = pt.lon < 0 ? pt.lon + 360 : pt.lon;
            const dec = pt.lat;
            const horiz = equatorialToHorizontal({ ra, dec }, location, currentTime);
            setViewAngle({ altitude: horiz.altitude, azimuth: horiz.azimuth });
            setSelectedObject({ kind: 'constellation', name: c.name, altitude: horiz.altitude, azimuth: horiz.azimuth });
          } else {
            setSelectedObject({ kind: 'constellation', name: c.name, altitude: viewAngle.altitude, azimuth: viewAngle.azimuth });
          }
          setSearchQuery('');
        },
      });
    }

    // 5) Named stars (constellation star set)
    for (let i = 0; i < constellationStars.length && results.length < limit; i++) {
      const star = constellationStars[i];
      const pos = starPositions[i];
      const hay = `${star.name} ${star.constellation}`.toLowerCase();
      if (!hay.includes(q)) continue;
      push({
        kind: 'star',
        title: star.name,
        subtitle: `${star.constellation} · Mag ${star.mag.toFixed(1)}`,
        onSelect: () => {
          setViewAngle({ altitude: pos.altitude, azimuth: pos.azimuth });
          setSelectedObject({
            kind: 'star',
            name: star.name,
            constellation: star.constellation,
            magnitude: star.mag,
            altitude: pos.altitude,
            azimuth: pos.azimuth,
          });
          setSearchQuery('');
        },
      });
    }

    return results;
  }, [searchQuery, currentTime, location, allConstellations, starPositions, viewAngle.altitude, viewAngle.azimuth]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      {/* Loading indicator */}
      {catalogLoading && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50">
          <div className={`text-center ${nightMode ? 'text-red-300' : 'text-white'}`}>
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-current mx-auto mb-4"></div>
            <p className="text-lg">Loading {fullStars.length > 0 ? fullStars.length : ''} stars...</p>
          </div>
        </div>
      )}
      
      {/* Full-screen Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-move"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleCanvasClick}
        onWheel={handleWheel}
      />

      {/* Satellites overlay canvas (lightweight, animated). */}
      <canvas
        ref={satellitesCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* Top Search Bar */}
      <div className="absolute top-4 right-4 w-80 max-w-[calc(100vw-2rem)] z-30">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search objects..."
            className={`w-full px-4 py-2 rounded-lg ${
              nightMode 
                ? 'bg-red-950/80 border-red-900 text-red-200 placeholder-red-400' 
                : 'bg-black/80 border-gray-700 text-white placeholder-gray-400'
            } border backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
          />
          {searchQuery && (
            <div className={`absolute top-full left-0 right-0 mt-1 rounded-lg shadow-lg max-h-60 overflow-y-auto ${
              nightMode ? 'bg-red-950/90' : 'bg-gray-900/90'
            } backdrop-blur-sm`}>
              {searchResults.length > 0 ? (
                searchResults.map((r, idx) => (
                  <button
                    key={idx}
                    onClick={r.onSelect}
                    className={`w-full px-4 py-2 text-left hover:bg-opacity-50 ${
                      nightMode ? 'hover:bg-red-900 text-red-200' : 'hover:bg-gray-800 text-white'
                    }`}
                  >
                    <div className="font-semibold">{r.title}</div>
                    <div className={`text-xs ${nightMode ? 'text-red-400' : 'text-gray-400'}`}>
                      {r.subtitle}
                    </div>
                  </button>
                ))
              ) : (
                <div className={`px-4 py-3 text-sm ${nightMode ? 'text-red-300' : 'text-gray-300'}`}>
                  No results
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Toolbar - Stellarium Style */}
      <div className={`absolute bottom-0 left-0 right-0 ${
        nightMode 
          ? 'bg-gradient-to-t from-red-950/90 via-red-950/70 to-transparent' 
          : 'bg-gradient-to-t from-black/90 via-black/70 to-transparent'
      } backdrop-blur-sm`}>
        <div className="flex items-center justify-between px-6 py-4">
          {/* Left: Toggle Buttons with Stellarium styling */}
          <div className="flex gap-1.5">
            <ToolbarButton
              active={showLines}
              onClick={() => setShowLines(!showLines)}
              nightMode={nightMode}
              title="Constellation Lines (C)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="5" cy="5" r="1.5" fill="currentColor"/>
                <circle cx="12" cy="8" r="1.5" fill="currentColor"/>
                <circle cx="19" cy="5" r="1.5" fill="currentColor"/>
                <circle cx="8" cy="15" r="1.5" fill="currentColor"/>
                <circle cx="16" cy="18" r="1.5" fill="currentColor"/>
                <line x1="5" y1="5" x2="12" y2="8"/>
                <line x1="12" y1="8" x2="19" y2="5"/>
                <line x1="12" y1="8" x2="8" y2="15"/>
                <line x1="8" y1="15" x2="16" y2="18"/>
              </svg>
            </ToolbarButton>
            <ToolbarButton
              active={showLabels}
              onClick={() => setShowLabels(!showLabels)}
              nightMode={nightMode}
              title="Constellation Labels (V)"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M4 4h4v2H6v2H4V4zm16 0h-4v2h2v2h2V4zM4 16h2v2h2v2H4v-4zm16 4h-4v-2h2v-2h2v4zM9 7h6v2H9V7zm0 4h6v2H9v-2zm0 4h6v2H9v-2z"/>
              </svg>
            </ToolbarButton>
            <ToolbarButton
              active={showGrid}
              onClick={() => setShowGrid(!showGrid)}
              nightMode={nightMode}
              title="Azimuthal Grid (Z)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"/>
                <circle cx="12" cy="12" r="6"/>
                <circle cx="12" cy="12" r="3"/>
                <line x1="12" y1="2" x2="12" y2="22"/>
                <line x1="2" y1="12" x2="22" y2="12"/>
                <line x1="5" y1="5" x2="19" y2="19"/>
                <line x1="19" y1="5" x2="5" y2="19"/>
              </svg>
            </ToolbarButton>
            
            <div className="w-px h-8 bg-gray-600 mx-1"></div>
            
            <ToolbarButton
              active={showDSOs}
              onClick={() => setShowDSOs(!showDSOs)}
              nightMode={nightMode}
              title="Deep Sky Objects (D)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <ellipse cx="12" cy="12" rx="8" ry="5"/>
                <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
              </svg>
            </ToolbarButton>

            <ToolbarButton
              active={realisticVisibility}
              onClick={() => setRealisticVisibility(!realisticVisibility)}
              nightMode={nightMode}
              title={realisticVisibility ? 'Realistic visibility: ON' : 'Realistic visibility: OFF (show all stars)'}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
                <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
              </svg>
            </ToolbarButton>

            <ToolbarButton
              active={bortleMode === 'auto'}
              onClick={() => setBortleMode(bortleMode === 'auto' ? 'manual' : 'auto')}
              nightMode={nightMode}
              title={bortleMode === 'auto' ? `Bortle: AUTO (${autoBortleScale})` : `Bortle: MANUAL (${manualBortleScale})`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M12 2v4" />
                <path d="M12 18v4" />
                <path d="M4.93 4.93l2.83 2.83" />
                <path d="M16.24 16.24l2.83 2.83" />
                <path d="M2 12h4" />
                <path d="M18 12h4" />
                <path d="M4.93 19.07l2.83-2.83" />
                <path d="M16.24 7.76l2.83-2.83" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </ToolbarButton>
            <ToolbarButton
              active={showSatellites}
              onClick={() => setShowSatellites(!showSatellites)}
              nightMode={nightMode}
              title="Satellites"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M3 11h6l3-3 3 3h6v2h-6l-3 3-3-3H3v-2z" />
                <path d="M5 7l2 4M19 7l-2 4M5 17l2-4M19 17l-2-4" opacity="0.7" />
              </svg>
            </ToolbarButton>
            <ToolbarButton
              active={showSatellites && satelliteGroup === 'starlink'}
              onClick={() => {
                const nextOn = !(showSatellites && satelliteGroup === 'starlink');
                if (nextOn) {
                  setShowSatellites(true);
                  setSatelliteGroup('starlink');
                } else {
                  setSatelliteGroup('visual');
                }
              }}
              nightMode={nightMode}
              title="Starlink satellites"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="2" fill="currentColor" />
                <path d="M4 12a8 8 0 0 1 16 0" opacity="0.7" />
                <path d="M2 12a10 10 0 0 1 20 0" opacity="0.35" />
              </svg>
            </ToolbarButton>
            <ToolbarButton
              active={showComets}
              onClick={() => setShowComets(!showComets)}
              nightMode={nightMode}
              title="Comets"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M21 3l-7 7" opacity="0.55" />
                <path d="M21 7l-9 9" opacity="0.35" />
                <path d="M21 11l-11 11" opacity="0.22" />
                <path d="M11 13a3 3 0 1 0 0.001 0z" fill="currentColor" stroke="none" />
              </svg>
            </ToolbarButton>
            <ToolbarButton
              active={nightMode}
              onClick={() => setNightMode(!nightMode)}
              nightMode={nightMode}
              title="Night Mode (N)"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            </ToolbarButton>
            <ToolbarButton
              active={showCrosshair}
              onClick={() => setShowCrosshair(!showCrosshair)}
              nightMode={nightMode}
              title="Center Marker"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="3"/>
                <line x1="12" y1="2" x2="12" y2="8"/>
                <line x1="12" y1="16" x2="12" y2="22"/>
                <line x1="2" y1="12" x2="8" y2="12"/>
                <line x1="16" y1="12" x2="22" y2="12"/>
              </svg>
            </ToolbarButton>
          </div>

          {/* Center: Time Controls with better styling */}
          <div className={`flex items-center gap-4 ${nightMode ? 'text-red-200' : 'text-white'}`}>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className={`p-2 rounded transition-all hover:scale-110 ${
                nightMode ? 'hover:bg-red-900/30' : 'hover:bg-white/10'
              }`}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="4" width="4" height="16" rx="1"/>
                  <rect x="14" y="4" width="4" height="16" rx="1"/>
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
            </button>
            
            <div className="text-center min-w-[140px]">
              <div className="font-mono text-lg font-semibold tracking-wide" suppressHydrationWarning>
                {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
              </div>
              <div className="text-xs opacity-75" suppressHydrationWarning>
                {currentTime.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
              </div>
            </div>

            <button
              onClick={() => setCurrentTime(new Date())}
              className={`px-4 py-1.5 text-sm font-medium rounded transition-all ${
                nightMode 
                  ? 'bg-red-800/80 hover:bg-red-700 border border-red-700' 
                  : 'bg-blue-600/80 hover:bg-blue-500 border border-blue-500'
              }`}
            >
              Now
            </button>
          </div>

          {/* Right: Speed & FOV Control */}
          <div className={`flex items-center gap-4 ${nightMode ? 'text-red-200' : 'text-white'}`}>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-xs opacity-75">Speed:</span>
                <span className="text-sm font-mono min-w-[60px]">{timeSpeed}×</span>
              </div>
              <input
                type="range"
                min="1"
                max="3600"
                value={timeSpeed}
                onChange={(e) => setTimeSpeed(Number(e.target.value))}
                className="w-32 h-1"
              />
            </div>
            
            <div className="w-px h-12 bg-gray-600"></div>
            
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-xs opacity-75">FOV:</span>
                <span className="text-sm font-mono min-w-[50px]">{fov.toFixed(0)}°</span>
              </div>
              <input
                type="range"
                min="30"
                max="120"
                value={fov}
                onChange={(e) => setFov(Number(e.target.value))}
                className="w-32 h-1"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Top Info Bar - Enhanced */}
      <div className={`absolute top-4 left-4 backdrop-blur-md px-4 py-2.5 rounded-lg text-sm shadow-lg border ${
        nightMode 
          ? 'bg-red-950/80 text-red-200 border-red-900/50' 
          : 'bg-black/80 text-white border-gray-700/50'
      }`}>
        <div className="flex items-center gap-4">
          <span>📍 {location.latitude.toFixed(2)}°N, {location.longitude.toFixed(2)}°E</span>
          <span>👁️ Alt: {viewAngle.altitude.toFixed(0)}° Az: {viewAngle.azimuth.toFixed(0)}°</span>
          <span>⭐ {fullStarPositions.filter(p => p.visible).length.toLocaleString()} stars above horizon</span>
          <span title={bortleMode === 'auto' ? `Auto from ${autoBortleLabel || 'location'}` : 'Manual (from slider)'}>
            🌃 Bortle: {effectiveBortleScale}{bortleMode === 'auto' ? ' (auto)' : ''}
          </span>
          {catalogLoading && <span className="animate-pulse">⏳ Loading catalog...</span>}
          {showSatellites && satelliteLoading && <span className="animate-pulse">🛰️ Loading satellites...</span>}
          {showComets && cometLoading && <span className="animate-pulse">☄️ Loading comets...</span>}
        </div>
      </div>

      {/* Object Info Panel */}
      {selectedObject && (
        <div className={`absolute top-20 right-4 w-80 backdrop-blur-md p-4 rounded-lg shadow-2xl ${
          nightMode 
            ? 'bg-red-950/90 border-red-900 text-red-100' 
            : 'bg-gradient-to-br from-blue-900/90 to-purple-900/90 border-blue-500/30 text-white'
        } border`}>
          <div className="flex justify-between items-start mb-3">
            <div>
              <h3 className="text-xl font-bold">
                {selectedObject.kind === 'star' ? selectedObject.name : selectedObject.name}
              </h3>
              <p className={`text-sm ${nightMode ? 'text-red-300' : 'text-gray-300'}`}>
                {selectedObject.kind === 'star'
                  ? (selectedObject.constellation || 'Star')
                  : selectedObject.kind === 'planet'
                    ? 'Planet'
                    : selectedObject.kind === 'dso'
                      ? 'Deep Sky Object'
                      : selectedObject.kind === 'satellite'
                        ? 'Satellite'
                        : selectedObject.kind === 'comet'
                          ? 'Comet'
                          : selectedObject.kind === 'body'
                            ? 'Solar System'
                            : 'Constellation'}
              </p>
            </div>
            <button
              onClick={() => setSelectedObject(null)}
              className={`${nightMode ? 'text-red-400 hover:text-red-200' : 'text-gray-400 hover:text-white'} transition-colors`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-2 text-sm">
            {selectedObject.kind === 'comet' && (
              <div className={`rounded p-2 col-span-2 ${nightMode ? 'bg-red-900/30' : 'bg-black/30'}`}>
                <div className={`text-xs ${nightMode ? 'text-red-400' : 'text-gray-400'}`}>Distances</div>
                <div className="font-semibold">
                  {typeof selectedObject.geoDistanceAu === 'number' ? `${selectedObject.geoDistanceAu.toFixed(2)} AU (geo)` : '—'}
                  {typeof selectedObject.helioDistanceAu === 'number' ? ` · ${selectedObject.helioDistanceAu.toFixed(2)} AU (helio)` : ''}
                </div>
              </div>
            )}
            {selectedObject.kind === 'comet' && (typeof selectedObject.perihelionDistanceAu === 'number' || typeof selectedObject.eccentricity === 'number') && (
              <div className={`rounded p-2 col-span-2 ${nightMode ? 'bg-red-900/30' : 'bg-black/30'}`}>
                <div className={`text-xs ${nightMode ? 'text-red-400' : 'text-gray-400'}`}>Orbit</div>
                <div className="font-semibold">
                  {typeof selectedObject.perihelionDistanceAu === 'number' ? `q ${selectedObject.perihelionDistanceAu.toFixed(2)} AU` : '—'}
                  {typeof selectedObject.eccentricity === 'number' ? ` · e ${selectedObject.eccentricity.toFixed(3)}` : ''}
                </div>
              </div>
            )}
            {selectedObject.kind === 'satellite' && typeof selectedObject.rangeKm === 'number' && (
              <div className={`rounded p-2 col-span-2 ${nightMode ? 'bg-red-900/30' : 'bg-black/30'}`}>
                <div className={`text-xs ${nightMode ? 'text-red-400' : 'text-gray-400'}`}>Range</div>
                <div className="font-semibold">{selectedObject.rangeKm.toFixed(0)} km</div>
              </div>
            )}
            {selectedObject.kind === 'satellite' && (typeof selectedObject.satnum === 'number' || selectedObject.group) && (
              <div className={`rounded p-2 col-span-2 ${nightMode ? 'bg-red-900/30' : 'bg-black/30'}`}>
                <div className={`text-xs ${nightMode ? 'text-red-400' : 'text-gray-400'}`}>NORAD / Group</div>
                <div className="font-semibold">
                  {(typeof selectedObject.satnum === 'number' ? `#${selectedObject.satnum}` : '—')}
                  {selectedObject.group ? ` · ${selectedObject.group}` : ''}
                </div>
              </div>
            )}
            {selectedObject.kind === 'satellite' && typeof selectedObject.inclinationDeg === 'number' && (
              <div className={`rounded p-2 ${nightMode ? 'bg-red-900/30' : 'bg-black/30'}`}>
                <div className={`text-xs ${nightMode ? 'text-red-400' : 'text-gray-400'}`}>Inclination</div>
                <div className="font-semibold">{selectedObject.inclinationDeg.toFixed(1)}°</div>
              </div>
            )}
            {selectedObject.kind === 'satellite' && typeof selectedObject.periodMin === 'number' && (
              <div className={`rounded p-2 ${nightMode ? 'bg-red-900/30' : 'bg-black/30'}`}>
                <div className={`text-xs ${nightMode ? 'text-red-400' : 'text-gray-400'}`}>Period</div>
                <div className="font-semibold">{selectedObject.periodMin.toFixed(1)} min</div>
              </div>
            )}
            {selectedObject.kind === 'planet' && typeof selectedObject.magnitude === 'number' && (
              <div className={`rounded p-2 ${nightMode ? 'bg-red-900/30' : 'bg-black/30'}`}>
                <div className={`text-xs ${nightMode ? 'text-red-400' : 'text-gray-400'}`}>Magnitude</div>
                <div className="font-semibold">{selectedObject.magnitude.toFixed(2)}</div>
              </div>
            )}
            {selectedObject.kind === 'planet' && typeof selectedObject.distanceAu === 'number' && (
              <div className={`rounded p-2 ${nightMode ? 'bg-red-900/30' : 'bg-black/30'}`}>
                <div className={`text-xs ${nightMode ? 'text-red-400' : 'text-gray-400'}`}>Distance</div>
                <div className="font-semibold">{selectedObject.distanceAu.toFixed(2)} AU</div>
              </div>
            )}
            {selectedObject.kind === 'dso' && (
              <div className={`rounded p-2 ${nightMode ? 'bg-red-900/30' : 'bg-black/30'}`}>
                <div className={`text-xs ${nightMode ? 'text-red-400' : 'text-gray-400'}`}>Type</div>
                <div className="font-semibold">{selectedObject.dsoType}</div>
              </div>
            )}
            {selectedObject.kind === 'dso' && (
              <div className={`rounded p-2 ${nightMode ? 'bg-red-900/30' : 'bg-black/30'}`}>
                <div className={`text-xs ${nightMode ? 'text-red-400' : 'text-gray-400'}`}>Magnitude</div>
                <div className="font-semibold">{selectedObject.magnitude.toFixed(2)}</div>
              </div>
            )}
            {selectedObject.kind === 'dso' && (
              <div className={`rounded p-2 col-span-2 ${nightMode ? 'bg-red-900/30' : 'bg-black/30'}`}>
                <div className={`text-xs ${nightMode ? 'text-red-400' : 'text-gray-400'}`}>Catalog</div>
                <div className="font-semibold">
                  {[selectedObject.messier, selectedObject.ngc].filter(Boolean).join(' · ') || '—'}
                </div>
              </div>
            )}
            {selectedObject.kind === 'star' && (
              <div className={`rounded p-2 ${nightMode ? 'bg-red-900/30' : 'bg-black/30'}`}>
                <div className={`text-xs ${nightMode ? 'text-red-400' : 'text-gray-400'}`}>Magnitude</div>
                <div className="font-semibold">{selectedObject.magnitude.toFixed(2)}</div>
              </div>
            )}
            {selectedObject.kind === 'star' && typeof selectedObject.id !== 'undefined' && (
              <div className={`rounded p-2 ${nightMode ? 'bg-red-900/30' : 'bg-black/30'}`}>
                <div className={`text-xs ${nightMode ? 'text-red-400' : 'text-gray-400'}`}>Catalog ID</div>
                <div className="font-semibold font-mono">{String(selectedObject.id)}</div>
              </div>
            )}
            <div className={`rounded p-2 ${nightMode ? 'bg-red-900/30' : 'bg-black/30'}`}>
              <div className={`text-xs ${nightMode ? 'text-red-400' : 'text-gray-400'}`}>Altitude</div>
              <div className="font-semibold">{selectedObject.altitude.toFixed(1)}°</div>
            </div>
            <div className={`rounded p-2 col-span-2 ${nightMode ? 'bg-red-900/30' : 'bg-black/30'}`}>
              <div className={`text-xs ${nightMode ? 'text-red-400' : 'text-gray-400'}`}>Azimuth</div>
              <div className="font-semibold">{selectedObject.azimuth.toFixed(1)}°</div>
            </div>
            {selectedObject.kind === 'star' && typeof selectedObject.ra === 'number' && typeof selectedObject.dec === 'number' && (
              <div className={`rounded p-2 col-span-2 ${nightMode ? 'bg-red-900/30' : 'bg-black/30'}`}>
                <div className={`text-xs ${nightMode ? 'text-red-400' : 'text-gray-400'}`}>RA / Dec</div>
                <div className="font-semibold font-mono">
                  {selectedObject.ra.toFixed(3)}° / {selectedObject.dec.toFixed(3)}°
                </div>
              </div>
            )}
          </div>

          {(selectedObject.kind === 'star' || selectedObject.kind === 'planet' || selectedObject.kind === 'dso' || selectedObject.kind === 'body') && (
            <div className={`mt-3 rounded p-2 ${nightMode ? 'bg-red-900/20' : 'bg-black/20'}`}>
              <div className={`text-xs font-semibold ${nightMode ? 'text-red-300' : 'text-gray-200'}`}>Wikipedia</div>
              {wikiLoading && <div className={`text-xs mt-1 ${nightMode ? 'text-red-300' : 'text-gray-300'}`}>Loading description…</div>}
              {!wikiLoading && wikiSummary?.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={wikiSummary.thumbnail}
                  alt={wikiSummary.title}
                  className="mt-2 w-full h-40 object-cover rounded"
                  loading="lazy"
                />
              )}
              {!wikiLoading && wikiSummary?.extract && (
                <div className={`text-xs mt-1 leading-snug ${nightMode ? 'text-red-100' : 'text-gray-100'}`}>
                  {wikiSummary.extract}
                </div>
              )}
              {!wikiLoading && !wikiSummary?.extract && wikiError && (
                <div className={`text-xs mt-1 ${nightMode ? 'text-red-300' : 'text-gray-300'}`}>No description found.</div>
              )}
              {!wikiLoading && wikiSummary?.url && (
                <a
                  href={wikiSummary.url}
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-block mt-2 text-xs underline ${nightMode ? 'text-red-200' : 'text-blue-200'}`}
                >
                  Open on Wikipedia
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Toolbar Button Component
function ToolbarButton({ 
  active, 
  onClick, 
  nightMode, 
  title, 
  children 
}: { 
  active: boolean; 
  onClick: () => void; 
  nightMode: boolean; 
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`p-2.5 rounded transition-all ${
        active 
          ? nightMode 
            ? 'bg-red-700/90 text-red-50 shadow-lg shadow-red-900/50' 
            : 'bg-blue-600/90 text-white shadow-lg shadow-blue-900/50'
          : nightMode 
            ? 'bg-red-950/50 text-red-300 hover:bg-red-900/70' 
            : 'bg-gray-800/50 text-gray-300 hover:bg-gray-700/70'
      } hover:scale-105 active:scale-95`}
      title={title}
    >
      {children}
    </button>
  );
}

// Helper: Draw crosshair at center
function drawCrosshair(ctx: CanvasRenderingContext2D, width: number, height: number, nightMode: boolean) {
  const centerX = width / 2;
  const centerY = height / 2;
  const size = 20;
  
  ctx.strokeStyle = nightMode ? 'rgba(255, 150, 150, 0.6)' : 'rgba(150, 200, 255, 0.6)';
  ctx.lineWidth = 2;
  
  // Draw crosshair
  ctx.beginPath();
  ctx.moveTo(centerX - size, centerY);
  ctx.lineTo(centerX - 5, centerY);
  ctx.moveTo(centerX + 5, centerY);
  ctx.lineTo(centerX + size, centerY);
  ctx.moveTo(centerX, centerY - size);
  ctx.lineTo(centerX, centerY - 5);
  ctx.moveTo(centerX, centerY + 5);
  ctx.lineTo(centerX, centerY + size);
  ctx.stroke();
  
  // Draw center circle
  ctx.beginPath();
  ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
  ctx.stroke();
}

// Helper: Draw FOV indicator
function drawFOVIndicator(ctx: CanvasRenderingContext2D, width: number, height: number, fov: number, nightMode: boolean) {
  ctx.fillStyle = nightMode ? 'rgba(255, 150, 150, 0.4)' : 'rgba(255, 255, 255, 0.4)';
  ctx.font = '12px monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(`FOV: ${fov.toFixed(0)}°`, width - 10, 10);
}

// Helper: Draw cardinal directions on horizon
function drawCardinalDirections(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  viewAngle: { altitude: number; azimuth: number },
  fov: number,
  nightMode: boolean
) {
  const directions = [
    { label: 'N', azimuth: 0, color: nightMode ? 'rgb(255, 150, 150)' : 'rgb(255, 100, 100)' },
    { label: 'NE', azimuth: 45, color: nightMode ? 'rgba(255, 150, 150, 0.6)' : 'rgba(255, 255, 255, 0.6)' },
    { label: 'E', azimuth: 90, color: nightMode ? 'rgb(255, 150, 150)' : 'rgb(150, 255, 150)' },
    { label: 'SE', azimuth: 135, color: nightMode ? 'rgba(255, 150, 150, 0.6)' : 'rgba(255, 255, 255, 0.6)' },
    { label: 'S', azimuth: 180, color: nightMode ? 'rgb(255, 150, 150)' : 'rgb(100, 150, 255)' },
    { label: 'SW', azimuth: 225, color: nightMode ? 'rgba(255, 150, 150, 0.6)' : 'rgba(255, 255, 255, 0.6)' },
    { label: 'W', azimuth: 270, color: nightMode ? 'rgb(255, 150, 150)' : 'rgb(255, 255, 100)' },
    { label: 'NW', azimuth: 315, color: nightMode ? 'rgba(255, 150, 150, 0.6)' : 'rgba(255, 255, 255, 0.6)' },
  ];
  
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  directions.forEach(({ label, azimuth, color }) => {
    const screen = projectToScreen(2, azimuth, width, height, viewAngle, fov);
    
    // Draw text shadow for readability
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillText(label, screen.x + 1, screen.y + 1);
    
    // Draw text
    ctx.fillStyle = color;
    ctx.fillText(label, screen.x, screen.y);
  });
}

// Helper: Draw atmosphere gradient with radial fisheye effect
function drawAtmosphere(ctx: CanvasRenderingContext2D, width: number, height: number, viewAltitude: number, nightMode: boolean) {
  // Create radial gradient for hemisphere effect
  const centerX = width / 2;
  const centerY = height / 2;
  const maxRadius = Math.max(width, height);
  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, maxRadius * 0.7);
  
  if (nightMode) {
    // Red night mode with subtle gradient
    gradient.addColorStop(0, 'rgb(20, 5, 10)');
    gradient.addColorStop(0.5, 'rgb(30, 5, 10)');
    gradient.addColorStop(1, 'rgb(60, 10, 10)');
  } else {
    // Enhanced Stellarium-style twilight atmosphere
    // More steps for smoother transitions
    gradient.addColorStop(0, 'rgb(0, 5, 25)');       // Deep midnight blue at zenith
    gradient.addColorStop(0.2, 'rgb(5, 10, 35)');    // Dark blue
    gradient.addColorStop(0.4, 'rgb(15, 25, 60)');   // Mid-blue
    gradient.addColorStop(0.55, 'rgb(30, 45, 95)');  // Lighter blue
    gradient.addColorStop(0.7, 'rgb(50, 70, 130)');  // Blue-purple
    gradient.addColorStop(0.82, 'rgb(90, 100, 150)'); // Purple-blue
    gradient.addColorStop(0.92, 'rgb(150, 120, 100)'); // Purple-orange transition
    gradient.addColorStop(1, 'rgb(255, 140, 70)');   // Orange-red at horizon
  }
  
  ctx.fillStyle = gradient;
  ctx.globalAlpha = 0.6; // Slightly more visible
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 1;
}

// Helper: Draw ground/landscape with realistic silhouettes
function drawHorizonLine(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  viewAngle: { altitude: number; azimuth: number },
  fov: number,
  nightMode: boolean
) {
  // Horizon is altitude = 0°, drawn as a crisp arc in the current fisheye view.
  const stepDeg = 2;
  const points: Array<{ x: number; y: number; started: boolean }> = [];

  for (let az = 0; az <= 360; az += stepDeg) {
    const screen = projectToScreen(0, az, width, height, viewAngle, fov);
    points.push({ x: screen.x, y: screen.y, started: screen.visible });
  }

  // Outer glow
  ctx.save();
  ctx.lineWidth = 4;
  ctx.strokeStyle = nightMode ? 'rgba(255, 120, 120, 0.35)' : 'rgba(180, 220, 255, 0.35)';
  ctx.shadowBlur = 10;
  ctx.shadowColor = nightMode ? 'rgba(255, 120, 120, 0.35)' : 'rgba(180, 220, 255, 0.35)';
  strokeHorizonPath(ctx, points);
  ctx.restore();

  // Crisp line
  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = nightMode ? 'rgba(255, 170, 170, 0.85)' : 'rgba(220, 240, 255, 0.85)';
  strokeHorizonPath(ctx, points);
  ctx.restore();
}

function strokeHorizonPath(
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number; started: boolean }>
) {
  let pathStarted = false;
  ctx.beginPath();
  for (const pt of points) {
    if (!pt.started) {
      pathStarted = false;
      continue;
    }
    if (!pathStarted) {
      ctx.moveTo(pt.x, pt.y);
      pathStarted = true;
    } else {
      ctx.lineTo(pt.x, pt.y);
    }
  }
  ctx.stroke();
}

function distancePointToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    return Math.hypot(px - x1, py - y1);
  }

  const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
  const clamped = Math.max(0, Math.min(1, t));
  const cx = x1 + clamped * dx;
  const cy = y1 + clamped * dy;
  return Math.hypot(px - cx, py - cy);
}

// Helper: Project altitude/azimuth to screen coordinates
// Helper: Project altitude/azimuth to screen using fisheye projection
function projectToScreen(
  altitude: number,
  azimuth: number,
  width: number,
  height: number,
  viewAngle: { altitude: number; azimuth: number },
  fov: number = 120
): { x: number; y: number; visible: boolean } {
  // Convert to radians
  const altRad = altitude * Math.PI / 180;
  const azRad = azimuth * Math.PI / 180;
  const viewAltRad = viewAngle.altitude * Math.PI / 180;
  const viewAzRad = viewAngle.azimuth * Math.PI / 180;

  // Calculate angular distance from view center using spherical geometry
  const cosDistance = Math.sin(altRad) * Math.sin(viewAltRad) +
                     Math.cos(altRad) * Math.cos(viewAltRad) * Math.cos(azRad - viewAzRad);
  const angularDistance = Math.acos(Math.max(-1, Math.min(1, cosDistance)));
  
  // Check if within FOV
  const maxAngle = (fov / 2) * Math.PI / 180;
  if (angularDistance > maxAngle) return { x: 0, y: 0, visible: false };

  // Fisheye projection - map angular distance to a radius that reaches the canvas corners.
  // Using the half-diagonal fills the entire rectangular canvas (no empty corners).
  const maxRadius = Math.hypot(width, height) / 2;
  const r = (angularDistance / maxAngle) * maxRadius;

  // Calculate bearing from view center to point
  const y = Math.sin(azRad - viewAzRad) * Math.cos(altRad);
  const x = Math.cos(viewAltRad) * Math.sin(altRad) - 
           Math.sin(viewAltRad) * Math.cos(altRad) * Math.cos(azRad - viewAzRad);
  const bearing = Math.atan2(y, x);

  // Project to screen with fisheye distortion
  const screenX = width / 2 + r * Math.sin(bearing);
  const screenY = height / 2 - r * Math.cos(bearing);

  return { x: screenX, y: screenY, visible: true };
}

function projectToScreenWithDistance(
  altitude: number,
  azimuth: number,
  width: number,
  height: number,
  viewAngle: { altitude: number; azimuth: number },
  fov: number = 120
): { x: number; y: number; visible: boolean; angularDistance: number; maxAngle: number } {
  const altRad = altitude * Math.PI / 180;
  const azRad = azimuth * Math.PI / 180;
  const viewAltRad = viewAngle.altitude * Math.PI / 180;
  const viewAzRad = viewAngle.azimuth * Math.PI / 180;

  const cosDistance = Math.sin(altRad) * Math.sin(viewAltRad) +
    Math.cos(altRad) * Math.cos(viewAltRad) * Math.cos(azRad - viewAzRad);
  const angularDistance = Math.acos(Math.max(-1, Math.min(1, cosDistance)));

  const maxAngle = (fov / 2) * Math.PI / 180;
  if (angularDistance > maxAngle) {
    return { x: 0, y: 0, visible: false, angularDistance, maxAngle };
  }

  const maxRadius = Math.hypot(width, height) / 2;
  const r = (angularDistance / maxAngle) * maxRadius;

  const y = Math.sin(azRad - viewAzRad) * Math.cos(altRad);
  const x = Math.cos(viewAltRad) * Math.sin(altRad) -
    Math.sin(viewAltRad) * Math.cos(altRad) * Math.cos(azRad - viewAzRad);
  const bearing = Math.atan2(y, x);

  const screenX = width / 2 + r * Math.sin(bearing);
  const screenY = height / 2 - r * Math.cos(bearing);

  return { x: screenX, y: screenY, visible: true, angularDistance, maxAngle };
}

function projectToScreenUnclamped(
  altitude: number,
  azimuth: number,
  width: number,
  height: number,
  viewAngle: { altitude: number; azimuth: number },
  fov: number = 120
): { x: number; y: number; visible: boolean; angularDistance: number; maxAngle: number } {
  const altRad = (altitude * Math.PI) / 180;
  const azRad = (azimuth * Math.PI) / 180;
  const viewAltRad = (viewAngle.altitude * Math.PI) / 180;
  const viewAzRad = (viewAngle.azimuth * Math.PI) / 180;

  const cosDistance =
    Math.sin(altRad) * Math.sin(viewAltRad) +
    Math.cos(altRad) * Math.cos(viewAltRad) * Math.cos(azRad - viewAzRad);
  const angularDistance = Math.acos(Math.max(-1, Math.min(1, cosDistance)));

  const maxAngle = (fov / 2) * (Math.PI / 180);
  const maxRadius = Math.hypot(width, height) / 2;
  const r = (angularDistance / Math.max(1e-6, maxAngle)) * maxRadius;

  const y = Math.sin(azRad - viewAzRad) * Math.cos(altRad);
  const x =
    Math.cos(viewAltRad) * Math.sin(altRad) -
    Math.sin(viewAltRad) * Math.cos(altRad) * Math.cos(azRad - viewAzRad);
  const bearing = Math.atan2(y, x);

  const screenX = width / 2 + r * Math.sin(bearing);
  const screenY = height / 2 - r * Math.cos(bearing);

  return { x: screenX, y: screenY, visible: angularDistance <= maxAngle, angularDistance, maxAngle };
}

function drawSkyTexture(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  location: ObserverLocation,
  currentTime: Date,
  viewAngle: { altitude: number; azimuth: number },
  fov: number,
  nightMode: boolean,
  showAtmosphere: boolean
) {
  const tile = getNoiseTileCanvas();
  if (!tile) return;

  const centerX = width / 2;
  const centerY = height / 2;
  const diag = Math.hypot(width, height);

  ctx.save();

  // 0) Subtle deep-space gradient so the background isn't flat.
  // Keep it extremely gentle to avoid overpowering labels/lines.
  const space = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, diag * 0.75);
  if (nightMode) {
    space.addColorStop(0, 'rgba(60, 0, 0, 0.10)');
    space.addColorStop(0.55, 'rgba(0, 0, 0, 0)');
    space.addColorStop(1, 'rgba(0, 0, 0, 0.22)');
  } else {
    space.addColorStop(0, 'rgba(18, 28, 60, 0.10)');
    space.addColorStop(0.55, 'rgba(0, 0, 0, 0)');
    space.addColorStop(1, 'rgba(0, 0, 0, 0.26)');
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = space;
  ctx.fillRect(0, 0, width, height);

  // 1) Sky-locked Milky Way: warped from galactic texture via real-time coordinates.
  drawMilkyWayWarped(ctx, width, height, location, currentTime, viewAngle, fov, nightMode, showAtmosphere);

  // 2) Fine grain (screen-space) to break banding
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = nightMode ? 0.10 : 0.06;
  for (let y = 0; y < height; y += tile.height) {
    for (let x = 0; x < width; x += tile.width) {
      ctx.drawImage(tile, x, y);
    }
  }

  // 3) Slight vignette to keep focus in the center.
  const vignette = ctx.createRadialGradient(centerX, centerY, Math.min(width, height) * 0.2, centerX, centerY, diag * 0.6);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(0.7, 'rgba(0,0,0,0.06)');
  vignette.addColorStop(1, nightMode ? 'rgba(0,0,0,0.58)' : 'rgba(0,0,0,0.46)');
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  ctx.restore();
}

// Helper: Draw all stars from full catalog (optimized for many stars)
function drawAllStars(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  location: ObserverLocation,
  currentTime: Date,
  starPositions: Array<{ altitude: number; azimuth: number; visible: boolean }>,
  stars: StarRecord[],
  viewAngle: { altitude: number; azimuth: number },
  fov: number,
  nightMode: boolean,
  bortleScale: number,
  realisticVisibility: boolean,
  opts?: { bloomPass?: boolean }
) {
  // Use additive blending for star glow overlap
  ctx.globalCompositeOperation = 'lighter';

  const bloomPass = !!opts?.bloomPass;

  // Precompute view params once per frame to avoid repeated trig work.
  const DEG2RAD = Math.PI / 180;
  const viewAltRad = viewAngle.altitude * DEG2RAD;
  const viewAzRad = viewAngle.azimuth * DEG2RAD;
  const sinViewAlt = Math.sin(viewAltRad);
  const cosViewAlt = Math.cos(viewAltRad);
  const maxAngle = (fov / 2) * DEG2RAD;
  const maxRadius = Math.hypot(width, height) / 2;
  const centerX = width / 2;
  const centerY = height / 2;

  const tSec = currentTime.getTime() / 1000;

  const sunNow = realisticVisibility ? getSunPosition(currentTime, location) : null;
  const moonNow = realisticVisibility ? getMoonPosition(currentTime, location) : null;
  for (let index = 0; index < stars.length; index++) {
    const star = stars[index];
    const pos = starPositions[index];
    if (!pos || pos.altitude < MIN_RENDER_ALTITUDE_DEG) continue;

    // Inline projection (same math as projectToScreen) with cached trig.
    const altRad = pos.altitude * DEG2RAD;
    const azRad = pos.azimuth * DEG2RAD;
    const sinAlt = Math.sin(altRad);
    const cosAlt = Math.cos(altRad);
    const deltaAz = azRad - viewAzRad;

    const cosDistance = sinAlt * sinViewAlt + cosAlt * cosViewAlt * Math.cos(deltaAz);
    const angularDistance = Math.acos(Math.max(-1, Math.min(1, cosDistance)));
    if (angularDistance > maxAngle) continue;

    const rProj = (angularDistance / maxAngle) * maxRadius;
    const yProj = Math.sin(deltaAz) * cosAlt;
    const xProj = cosViewAlt * sinAlt - sinViewAlt * cosAlt * Math.cos(deltaAz);
    const bearing = Math.atan2(yProj, xProj);

    const screenX = centerX + rProj * Math.sin(bearing);
    const screenY = centerY - rProj * Math.cos(bearing);

    // Realistic visibility is applied only above the horizon to keep the full-sphere view populated.
    // (Below-horizon stars fade via the existing lower-hemisphere fade.)
    const vis = realisticVisibility && sunNow && moonNow && pos.altitude > 0
      ? starVisibility(star.mag, {
          bortleScale,
          sunAltitudeDeg: sunNow.altitude,
          moonAltitudeDeg: moonNow.altitude,
          moonIlluminationFrac: moonNow.illumination,
          targetAltitudeDeg: pos.altitude,
        })
      : null;
    if (vis && !vis.visible) continue;
    
    // Simple Stellarium-like magnitude scaling
    // Brighter stars (lower mag) = larger and more visible
    const brightness = Math.pow(2.512, -star.mag); // Astronomical formula
    const sizeFactor = Math.max(0.5, Math.min(10, brightness / 2)); // More aggressive scaling
    const baseSize = sizeFactor * (120 / fov) * (bloomPass ? 1.12 : 1.0); // Scale with FOV
    
    // Get realistic star color, with scotopic desaturation for faint/near-limit stars.
    const color = getStarColorFromBV(star.bv);
    
    // Convert hex to RGB
    let r = 255, g = 255, b = 255;
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    }
    
    // Validate RGB
    r = isNaN(r) ? 255 : r;
    g = isNaN(g) ? 255 : g;
    b = isNaN(b) ? 255 : b;

    // As stars approach the limiting magnitude, color perception desaturates.
    const faintness = vis
      ? Math.max(0, Math.min(1, (vis.effectiveMagnitude - (vis.limitingMagnitude - 1.2)) / 1.6))
      : 0;
    if (faintness > 0) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      const t = Math.min(1, faintness);
      r = Math.round(r + (gray - r) * t);
      g = Math.round(g + (gray - g) * t);
      b = Math.round(b + (gray - b) * t);
    }
    
    // Twinkle: keep very subtle (too much reads as "animated").
    const phase = ((index * 1103515245 + 12345) >>> 0) / 0xffffffff;
    const twinkleBase = 0.985 + 0.015 * Math.sin(tSec * (0.45 + phase * 0.9) + phase * Math.PI * 2);
    const horizonBoost = pos.altitude < 10 ? (1 - Math.max(0, pos.altitude) / 10) : 0;
    const twinkle = twinkleBase + 0.03 * horizonBoost * (0.5 + 0.5 * Math.sin(tSec * (1.2 + phase * 2.0) + phase * 7.0));

    // Scintillation/jitter is very easy to overdo. Keep essentially static.
    const scintAmp = 0.06 * horizonBoost * (0.55 + 0.45 * Math.sin(tSec * (0.9 + phase * 1.1) + phase * 11.3));
    const scintX = Math.sin(tSec * (1.0 + phase * 1.4) + phase * 5.1) * scintAmp;
    const scintY = Math.cos(tSec * (0.9 + phase * 1.2) + phase * 6.7) * scintAmp;

    // Calculate alpha based on magnitude; avoid making the whole sky "milky".
    let alpha = nightMode ? getStarAlpha(star.mag) : Math.max(0.25, Math.min(0.95, brightness / 6));
    if (pos.altitude < 0) {
      const t = Math.max(0, Math.min(1, (pos.altitude - MIN_RENDER_ALTITUDE_DEG) / (0 - MIN_RENDER_ALTITUDE_DEG)));
      alpha *= 0.5 + 0.5 * t;
    }
    alpha *= Math.max(0.70, Math.min(1.22, twinkle));
    alpha = Math.min(1, alpha * (nightMode ? 1.15 : 1.1));

    // Bloom buffer wants brighter sources (blur will spread energy).
    if (bloomPass) alpha = Math.min(1, alpha * (nightMode ? 1.25 : 1.35));

    // Apply global sky transparency (twilight + moonlight) when realism is enabled.
    if (vis) alpha *= 0.25 + 0.75 * vis.alphaScale;

    // Outer glow only for brighter stars; halos on every star reads "gamey".
    if (shouldStarGlow(star.mag)) {
      // Avoid per-star ctx.filter blur (very expensive). Use a single gradient.
      const glowSize = baseSize * (3.8 + 0.9 * (twinkle - 1));
      const glowGradient = ctx.createRadialGradient(
        screenX + scintX,
        screenY + scintY,
        0,
        screenX + scintX,
        screenY + scintY,
        glowSize
      );

      if (nightMode) {
        glowGradient.addColorStop(0, `rgba(255, 240, 240, ${alpha * 0.30})`);
        glowGradient.addColorStop(0.5, `rgba(255, 220, 220, ${alpha * 0.15})`);
        glowGradient.addColorStop(1, `rgba(255, 200, 200, 0)`);
      } else {
        glowGradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha * 0.26})`);
        glowGradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${alpha * 0.13})`);
        glowGradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      }

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = glowGradient;
      ctx.beginPath();
      ctx.arc(screenX, screenY, glowSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    
    // Draw core
    const coreSize = baseSize * (1.75 + 0.10 * (twinkle - 1));
    // Extra sparkle only for the very brightest stars.
    if (star.mag <= 0.4) {
      const spikeLen = (10 + (1.2 - star.mag) * 14) * (120 / fov);
      const spikeAlpha = (nightMode ? 0.22 : 0.18) * alpha;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = nightMode
        ? `rgba(255, 190, 190, ${spikeAlpha})`
        : `rgba(${r}, ${g}, ${b}, ${spikeAlpha})`;
      ctx.lineWidth = Math.max(1, baseSize * 0.35);
      ctx.lineCap = 'round';
      ctx.beginPath();
      // Cross spikes
      ctx.moveTo(screenX - spikeLen, screenY);
      ctx.lineTo(screenX + spikeLen, screenY);
      ctx.moveTo(screenX, screenY - spikeLen);
      ctx.lineTo(screenX, screenY + spikeLen);
      // Diagonal spikes (shorter)
      const d = spikeLen * 0.65;
      ctx.moveTo(screenX - d, screenY - d);
      ctx.lineTo(screenX + d, screenY + d);
      ctx.moveTo(screenX - d, screenY + d);
      ctx.lineTo(screenX + d, screenY - d);
      ctx.stroke();
      ctx.restore();
    }
    const coreGradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, coreSize);
    
    if (nightMode) {
      coreGradient.addColorStop(0, `rgba(255, 240, 240, ${Math.min(1, alpha * 1.75)})`);
      coreGradient.addColorStop(0.7, `rgba(255, 220, 220, ${alpha * 0.6})`);
      coreGradient.addColorStop(1, `rgba(255, 200, 200, 0)`);
    } else {
      coreGradient.addColorStop(0, `rgba(${Math.min(255, r + 80)}, ${Math.min(255, g + 80)}, ${Math.min(255, b + 80)}, ${Math.min(1, alpha * 2.35)})`);
      coreGradient.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, ${alpha * 0.92})`);
      coreGradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = coreGradient;
    ctx.beginPath();
    ctx.arc(screenX, screenY, coreSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Avoid a hard-edged center dot (reads as a pixel).
    // Use a tiny Gaussian-like core instead.
    const dotSize = Math.max(1.1, baseSize * 0.78);
    const dot = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, dotSize);
    if (nightMode) {
      dot.addColorStop(0, `rgba(255, 255, 255, ${Math.min(1, alpha * 1.65)})`);
      dot.addColorStop(0.35, `rgba(255, 245, 245, ${Math.min(1, alpha * 0.7)})`);
      dot.addColorStop(1, 'rgba(255, 255, 255, 0)');
    } else {
      dot.addColorStop(0, `rgba(${Math.min(255, r + 80)}, ${Math.min(255, g + 80)}, ${Math.min(255, b + 80)}, ${Math.min(1, alpha * 1.65)})`);
      dot.addColorStop(0.35, `rgba(${r}, ${g}, ${b}, ${Math.min(1, alpha * 0.7)})`);
      dot.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = dot;
    ctx.beginPath();
    ctx.arc(screenX, screenY, dotSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    
    // Diffraction spikes only for the brightest stars (keep rare/subtle).
    if (star.mag < 0.2 && brightness > 3) {
      const spikeLength = baseSize * 6;
      const spikeWidth = baseSize * 0.12;
      
      [0, 90, 180, 270].forEach(angle => {
        const rad = (angle * Math.PI) / 180;
        const gradient = ctx.createLinearGradient(
          screenX, screenY,
          screenX + Math.cos(rad) * spikeLength,
          screenY + Math.sin(rad) * spikeLength
        );
        
        if (nightMode) {
          gradient.addColorStop(0, `rgba(255, 240, 240, ${alpha})`);
          gradient.addColorStop(0.5, `rgba(255, 220, 220, ${alpha * 0.4})`);
          gradient.addColorStop(1, `rgba(255, 200, 200, 0)`);
        } else {
          gradient.addColorStop(0, `rgba(${Math.min(255, r + 50)}, ${Math.min(255, g + 50)}, ${Math.min(255, b + 50)}, ${alpha * 0.9})`);
          gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${alpha * 0.4})`);
          gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        }
        
        ctx.fillStyle = gradient;
        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.rotate(rad);
        ctx.fillRect(0, -spikeWidth, spikeLength, spikeWidth * 2);
        ctx.restore();
      });
    }
  }
  
  // Reset composite operation
  ctx.globalCompositeOperation = 'source-over';
}

// Helper: Draw stars
function drawStars(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  starPositions: Array<{ altitude: number; azimuth: number; visible: boolean }>,
  viewAngle: { altitude: number; azimuth: number },
  fov: number,
  nightMode: boolean
) {
  constellationStars.forEach((star, index) => {
    const pos = starPositions[index];
    if (pos.altitude < MIN_RENDER_ALTITUDE_DEG) return;

    const screen = projectToScreen(pos.altitude, pos.azimuth, width, height, viewAngle, fov);
    if (!screen.visible) return;

    // Star size based on magnitude (more dramatic variation)
    const size = Math.max(0.8, 5 - star.mag * 0.8);

    // Star color
    const color = nightMode ? getStarColorNightMode(star.mag) : getStarColor(star.mag);

    // Draw glow for bright stars
    if (star.mag < 2.5) {
      const glowSize = size * 4.5;
      const glowGradient = ctx.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, glowSize);
      glowGradient.addColorStop(0, color.replace('rgb(', 'rgba(').replace(')', ', 0.18)'));
      glowGradient.addColorStop(0.55, color.replace('rgb(', 'rgba(').replace(')', ', 0.08)'));
      glowGradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = glowGradient;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, glowSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Soft core (no hard disc)
    const coreSize = Math.max(1.2, size * 1.25);
    const core = ctx.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, coreSize);
    core.addColorStop(0, color.replace('rgb(', 'rgba(').replace(')', ', 0.95)'));
    core.addColorStop(0.45, color.replace('rgb(', 'rgba(').replace(')', ', 0.35)'));
    core.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, coreSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Add sparkle to very bright stars
    if (star.mag < 1) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.6;
      const spikeLength = size * 3;
      ctx.beginPath();
      ctx.moveTo(screen.x - spikeLength, screen.y);
      ctx.lineTo(screen.x + spikeLength, screen.y);
      ctx.moveTo(screen.x, screen.y - spikeLength);
      ctx.lineTo(screen.x, screen.y + spikeLength);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  });
}

// Helper: Draw deep sky objects (galaxies, nebulae, clusters)
function drawDeepSkyObjects(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  location: ObserverLocation,
  currentTime: Date,
  viewAngle: { altitude: number; azimuth: number },
  fov: number,
  nightMode: boolean,
  bortleScale: number,
  realisticVisibility: boolean,
  markers?: Array<{
    name: string;
    messier?: string;
    ngc?: string;
    dsoType: string;
    x: number;
    y: number;
    radius: number;
    altitude: number;
    azimuth: number;
    magnitude: number;
    sizeArcmin: number;
    constellation?: string;
    ra?: number;
    dec?: number;
  }>
) {
  const sunNow = realisticVisibility ? getSunPosition(currentTime, location) : null;
  const moonNow = realisticVisibility ? getMoonPosition(currentTime, location) : null;

  // Only consider reasonably bright catalog entries; detectability will further cull.
  const visibleDSOs = deepSkyObjects.filter(dso => dso.magnitude <= 9.5);
  
  visibleDSOs.forEach(dso => {
    // Convert to horizontal coordinates
    const horiz = equatorialToHorizontal({ ra: dso.ra, dec: dso.dec }, location, currentTime);
    
    // Allow below-horizon rendering to match full-sphere view
    if (horiz.altitude < MIN_RENDER_ALTITUDE_DEG) return;

    const det = realisticVisibility && sunNow && moonNow && horiz.altitude > 0
      ? dsoDetectability(
          { magnitude: dso.magnitude, sizeArcmin: dso.size },
          {
            bortleScale,
            sunAltitudeDeg: sunNow.altitude,
            moonAltitudeDeg: moonNow.altitude,
            moonIlluminationFrac: moonNow.illumination,
            targetAltitudeDeg: horiz.altitude,
          }
        )
      : null;
    if (det && !det.visible) return;
    
    // Project to screen
    const screen = projectToScreen(horiz.altitude, horiz.azimuth, width, height, viewAngle, fov);
    if (!screen.visible) return;
    
    // Calculate size - more subtle like Stellarium
    const baseSize = (dso.size / 60) * (width / fov) * 80; // Angular size to pixels
    const minSize = dso.type === 'galaxy' ? 10 : 12; // Minimum visible size
    const maxSize = dso.type === 'galaxy' ? 40 : 50; // Maximum size
    const visualSize = Math.max(minSize, Math.min(maxSize, baseSize));
    
    // Brightness factor based on magnitude (brighter = more visible)
    const brightnessFactor = det
      ? Math.max(0.12, Math.min(1.0, (0.35 + 0.85 * det.alpha) * (0.7 - dso.magnitude / 20)))
      : Math.max(0.2, 0.8 - (dso.magnitude / 12));
    
    const color = getDSOColorForObject(dso, nightMode);

    // Default blending (additive tends to create neon hues).
    ctx.globalCompositeOperation = 'source-over';
    
    // Draw a subtle fuzzy glow for extended objects (galaxies, nebulae)
    if (dso.type === 'galaxy' || dso.type === 'nebula') {
      // Outer glow - subtle and diffuse like Stellarium
      const outerGlow = ctx.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, visualSize * 2);
      outerGlow.addColorStop(0, color.replace(/[\d.]+\)/, `${brightnessFactor * 0.12})`));
      outerGlow.addColorStop(0.3, color.replace(/[\d.]+\)/, `${brightnessFactor * 0.07})`));
      outerGlow.addColorStop(0.6, color.replace(/[\d.]+\)/, `${brightnessFactor * 0.03})`));
      outerGlow.addColorStop(1, color.replace(/[\d.]+\)/, '0)'));
      
      ctx.fillStyle = outerGlow;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, visualSize * 2, 0, Math.PI * 2);
      ctx.fill();
      
      // Inner core - concentrated but not overpowering
      const innerGlow = ctx.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, visualSize);
      innerGlow.addColorStop(0, color.replace(/[\d.]+\)/, `${brightnessFactor * 0.22})`));
      innerGlow.addColorStop(0.4, color.replace(/[\d.]+\)/, `${brightnessFactor * 0.14})`));
      innerGlow.addColorStop(0.8, color.replace(/[\d.]+\)/, `${brightnessFactor * 0.05})`));
      innerGlow.addColorStop(1, color.replace(/[\d.]+\)/, '0)'));
      
      ctx.fillStyle = innerGlow;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, visualSize, 0, Math.PI * 2);
      ctx.fill();
    } else if (dso.type === 'planetary-nebula') {
      // Planetary nebulae - ring-like appearance
      const gradient = ctx.createRadialGradient(screen.x, screen.y, visualSize * 0.3, screen.x, screen.y, visualSize);
      gradient.addColorStop(0, color.replace(/[\d.]+\)/, `${brightnessFactor * 0.08})`));
      gradient.addColorStop(0.5, color.replace(/[\d.]+\)/, `${brightnessFactor * 0.22})`));
      gradient.addColorStop(0.8, color.replace(/[\d.]+\)/, `${brightnessFactor * 0.10})`));
      gradient.addColorStop(1, color.replace(/[\d.]+\)/, '0)'));
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, visualSize, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Clusters - show as fuzzy patch with individual stars
      const gradient = ctx.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, visualSize);
      gradient.addColorStop(0, color.replace(/[\d.]+\)/, `${brightnessFactor * 0.18})`));
      gradient.addColorStop(0.5, color.replace(/[\d.]+\)/, `${brightnessFactor * 0.10})`));
      gradient.addColorStop(1, color.replace(/[\d.]+\)/, '0)'));
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, visualSize, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Draw a small, subtle central marker
    ctx.fillStyle = det
      ? color.replace(/[\d.]+\)/, `${(nightMode ? 0.55 : 0.65) * (0.4 + 0.6 * det.alpha)})`)
      : color.replace(/[\d.]+\)/, nightMode ? '0.65)' : '0.75)');
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, 2, 0, Math.PI * 2);
    ctx.fill();
    
    // Reset to normal blending for labels
    ctx.globalCompositeOperation = 'source-over';
    
    // Draw label only when sufficiently detectable (keeps clutter down in bright skies)
    ctx.font = 'bold 12px Arial';
    ctx.fillStyle = det
      ? color.replace(/[\d.]+\)/, `${0.45 + 0.50 * det.alpha})`)
      : color.replace(/[\d.]+\)/, '0.95)');
    ctx.shadowBlur = 4;
    ctx.shadowColor = 'rgba(0, 0, 0, 1)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    if (!det || det.alpha > 0.35) {
      const label = dso.messier || dso.name;
      ctx.fillText(label, screen.x, screen.y - visualSize - 10);
    }
    
    ctx.shadowBlur = 0;

    // Emit marker for click hit-testing
    if (markers) {
      markers.push({
        name: dso.name,
        messier: dso.messier,
        ngc: dso.ngc,
        dsoType: dso.type,
        x: screen.x,
        y: screen.y,
        radius: Math.max(8, visualSize),
        altitude: horiz.altitude,
        azimuth: horiz.azimuth,
        magnitude: dso.magnitude,
        sizeArcmin: dso.size,
        constellation: dso.constellation,
        ra: dso.ra,
        dec: dso.dec,
      });
    }
  });
}

function drawSunMoon(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  location: ObserverLocation,
  currentTime: Date,
  viewAngle: { altitude: number; azimuth: number },
  fov: number,
  nightMode: boolean,
  opts: {
    showSunPath: boolean;
    showMoonPath: boolean;
    sunMarkerRef: React.MutableRefObject<{
      x: number;
      y: number;
      visible: boolean;
      radius: number;
      altitude: number;
      azimuth: number;
    } | null>;
    moonMarkerRef: React.MutableRefObject<{
      x: number;
      y: number;
      visible: boolean;
      radius: number;
      altitude: number;
      azimuth: number;
    } | null>;
  }
) {
  const start = new Date(currentTime);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const stepMs = 10 * 60 * 1000; // 10 minutes (denser sampling so the path looks continuous)

  const sunStroke = nightMode ? 'rgba(255, 140, 140, 0.45)' : 'rgba(255, 220, 120, 0.45)';
  const moonStroke = nightMode ? 'rgba(255, 180, 180, 0.40)' : 'rgba(200, 225, 255, 0.38)';

  // Paths are intentionally hidden by default to avoid clutter.
  if (opts.showSunPath) {
    drawBodyPath(ctx, width, height, start, end, stepMs, (t) => getSunPosition(t, location), viewAngle, fov, sunStroke, 2);
  }
  if (opts.showMoonPath) {
    drawBodyPath(ctx, width, height, start, end, stepMs, (t) => getMoonPosition(t, location), viewAngle, fov, moonStroke, 2);
  }

  const sunNow = getSunPosition(currentTime, location);
  const moonNow = getMoonPosition(currentTime, location);

  const angularDiameterDegToPxRadius = (diameterDeg: number, scale: number) => {
    const maxAngle = (fov / 2) * Math.PI / 180;
    const maxRadius = Math.hypot(width, height) / 2;
    const radiusRad = ((diameterDeg * scale) / 2) * Math.PI / 180;
    return (radiusRad / maxAngle) * maxRadius;
  };

  // Real angular sizes are small in a wide-FOV sky view.
  // Scale up slightly so Sun/Moon read clearly while staying proportional.
  const VISUAL_ANGULAR_SCALE = 4.0;
  const sunRadius = Math.max(14 * (120 / fov), angularDiameterDegToPxRadius(sunNow.angularDiameterDeg, VISUAL_ANGULAR_SCALE));
  const moonRadius = Math.max(12 * (120 / fov), angularDiameterDegToPxRadius(moonNow.angularDiameterDeg, VISUAL_ANGULAR_SCALE));

  const sunScreenD = projectToScreenWithDistance(sunNow.altitude, sunNow.azimuth, width, height, viewAngle, fov);
  const sunScreen = { x: sunScreenD.x, y: sunScreenD.y, visible: sunScreenD.visible };
  const moonScreen = projectToScreen(moonNow.altitude, moonNow.azimuth, width, height, viewAngle, fov);

  opts.sunMarkerRef.current = {
    x: sunScreen.x,
    y: sunScreen.y,
    visible: sunScreen.visible,
    radius: sunRadius,
    altitude: sunNow.altitude,
    azimuth: sunNow.azimuth,
  };
  opts.moonMarkerRef.current = {
    x: moonScreen.x,
    y: moonScreen.y,
    visible: moonScreen.visible,
    radius: moonRadius,
    altitude: moonNow.altitude,
    azimuth: moonNow.azimuth,
  };

  // Textured markers
  drawSunMarker(ctx, width, height, sunNow.altitude, sunNow.azimuth, viewAngle, fov, nightMode, sunRadius, currentTime);

  // Optional realism: subtle lens flare when Sun is in view.
  const sunCenterFactor = clamp01(1 - sunScreenD.angularDistance / Math.max(1e-6, sunScreenD.maxAngle));
  drawSunLensFlare(ctx, width, height, sunScreen, sunNow.altitude, sunCenterFactor, nightMode);

  drawMoonMarker(ctx, width, height, moonNow.altitude, moonNow.azimuth, viewAngle, fov, nightMode, moonRadius, currentTime, {
    altitude: sunNow.altitude,
    azimuth: sunNow.azimuth,
  }, moonNow.illumination, moonNow.phase);
}

function drawBodyPath(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  start: Date,
  end: Date,
  stepMs: number,
  getPos: (t: Date) => { altitude: number; azimuth: number },
  viewAngle: { altitude: number; azimuth: number },
  fov: number,
  strokeStyle: string,
  lineWidth: number
) {
  ctx.save();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.shadowBlur = 6;
  ctx.shadowColor = strokeStyle;

  const maxAngle = (fov / 2) * Math.PI / 180;
  let pathStarted = false;
  ctx.beginPath();

  let prev: { altitude: number; azimuth: number } | null = null;
  let prevScreen: { x: number; y: number; visible: boolean } | null = null;

  for (let tMs = start.getTime(); tMs <= end.getTime(); tMs += stepMs) {
    const t = new Date(tMs);
    const p = getPos(t);

    const usable = p.altitude >= MIN_RENDER_ALTITUDE_DEG;
    const screen = usable
      ? projectToScreen(p.altitude, p.azimuth, width, height, viewAngle, fov)
      : { x: 0, y: 0, visible: false };

    if (prev && prevScreen) {
      const prevUsable = prev.altitude >= MIN_RENDER_ALTITUDE_DEG;
      const prevVis = prevUsable && prevScreen.visible;
      const currVis = usable && screen.visible;

      if (prevVis && currVis) {
        if (!pathStarted) {
          ctx.moveTo(prevScreen.x, prevScreen.y);
          pathStarted = true;
        }
        ctx.lineTo(screen.x, screen.y);
      } else if (prevVis && !currVis) {
        // Draw to the boundary so the path doesn't appear to "break" prematurely.
        // Only attempt boundary connection when both endpoints are within our altitude domain.
        if (prevUsable && usable) {
          const boundary = findVisibilityBoundary(prev, p, width, height, viewAngle, maxAngle);
          if (boundary) {
            const b = projectToScreen(boundary.altitude, boundary.azimuth, width, height, viewAngle, fov);
            if (b.visible) {
              if (!pathStarted) {
                ctx.moveTo(prevScreen.x, prevScreen.y);
                pathStarted = true;
              }
              ctx.lineTo(b.x, b.y);
            }
          }
        }
        if (pathStarted) {
          ctx.stroke();
          ctx.beginPath();
          pathStarted = false;
        }
      } else if (!prevVis && currVis) {
        // Start from the boundary when entering visibility.
        if (prevUsable && usable) {
          const boundary = findVisibilityBoundary(prev, p, width, height, viewAngle, maxAngle);
          if (boundary) {
            const b = projectToScreen(boundary.altitude, boundary.azimuth, width, height, viewAngle, fov);
            if (b.visible) {
              ctx.moveTo(b.x, b.y);
              pathStarted = true;
              ctx.lineTo(screen.x, screen.y);
            } else {
              ctx.moveTo(screen.x, screen.y);
              pathStarted = true;
            }
          } else {
            ctx.moveTo(screen.x, screen.y);
            pathStarted = true;
          }
        } else {
          ctx.moveTo(screen.x, screen.y);
          pathStarted = true;
        }
      }
    }

    prev = p;
    prevScreen = screen;
  }

  if (pathStarted) ctx.stroke();
  ctx.restore();
}

function normalizeAngleDeg(deg: number) {
  let a = deg % 360;
  if (a < 0) a += 360;
  return a;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpAngleDeg(a: number, b: number, t: number) {
  const aN = normalizeAngleDeg(a);
  const bN = normalizeAngleDeg(b);
  let d = bN - aN;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return normalizeAngleDeg(aN + d * t);
}

function findVisibilityBoundary(
  from: { altitude: number; azimuth: number },
  to: { altitude: number; azimuth: number },
  width: number,
  height: number,
  viewAngle: { altitude: number; azimuth: number },
  maxAngle: number
) {
  // Binary search t in [0,1] for the transition point where angularDistance ~= maxAngle.
  // Works even if one side is out-of-view.
  let lo = 0;
  let hi = 1;

  const isVisibleAt = (t: number) => {
    const alt = lerp(from.altitude, to.altitude, t);
    const az = lerpAngleDeg(from.azimuth, to.azimuth, t);

    const altRad = alt * Math.PI / 180;
    const azRad = az * Math.PI / 180;
    const viewAltRad = viewAngle.altitude * Math.PI / 180;
    const viewAzRad = viewAngle.azimuth * Math.PI / 180;
    const cosDistance = Math.sin(altRad) * Math.sin(viewAltRad) +
      Math.cos(altRad) * Math.cos(viewAltRad) * Math.cos(azRad - viewAzRad);
    const angularDistance = Math.acos(Math.max(-1, Math.min(1, cosDistance)));
    return angularDistance <= maxAngle;
  };

  const loVis = isVisibleAt(lo);
  const hiVis = isVisibleAt(hi);
  if (loVis === hiVis) {
    // No crossing within segment.
    return null;
  }

  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const midVis = isVisibleAt(mid);
    if (midVis === loVis) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const t = (lo + hi) / 2;
  return {
    altitude: lerp(from.altitude, to.altitude, t),
    azimuth: lerpAngleDeg(from.azimuth, to.azimuth, t),
  };
}

function drawPlanets(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  location: ObserverLocation,
  currentTime: Date,
  viewAngle: { altitude: number; azimuth: number },
  fov: number,
  nightMode: boolean,
  markers?: Array<{
    name: string;
    x: number;
    y: number;
    radius: number;
    altitude: number;
    azimuth: number;
    magnitude?: number;
    distanceAu?: number;
    angularDiameterDeg?: number;
  }>
) {
  const angularDiameterDegToPxRadius = (diameterDeg: number, scale: number) => {
    const maxAngle = (fov / 2) * Math.PI / 180;
    const maxRadius = Math.hypot(width, height) / 2;
    const radiusRad = ((diameterDeg * scale) / 2) * Math.PI / 180;
    return (radiusRad / maxAngle) * maxRadius;
  };

  const AU_KM = 149_597_870.7;
  const maxAngleRad = (fov / 2) * Math.PI / 180;
  const maxRadius = Math.hypot(width, height) / 2;

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  const drawApproxMajorMoons = (
    planetName: string,
    planetColor: string,
    planetScreen: { x: number; y: number },
    planetSizePx: number,
    planetDistanceAu: number,
    ringTiltDeg?: number
  ) => {
    // Major moons list (not ephemeris-accurate; animated for visual context).
    // Jupiter uses accurate ephemerides via getJupiterMoonsHorizontalPositions.
    const moonsByPlanet: Record<string, Array<{ name: string; orbitKm: number; radiusKm: number; periodDays: number }>> = {
      Mars: [
        { name: 'Phobos', orbitKm: 9_378, radiusKm: 11.3, periodDays: 0.3189 },
        { name: 'Deimos', orbitKm: 23_460, radiusKm: 6.2, periodDays: 1.263 },
      ],
      Saturn: [
        { name: 'Titan', orbitKm: 1_221_870, radiusKm: 2_574.7, periodDays: 15.945 },
        { name: 'Rhea', orbitKm: 527_108, radiusKm: 763.8, periodDays: 4.518 },
        { name: 'Iapetus', orbitKm: 3_560_820, radiusKm: 734.5, periodDays: 79.3215 },
      ],
      Uranus: [
        { name: 'Titania', orbitKm: 435_910, radiusKm: 788.9, periodDays: 8.706 },
        { name: 'Oberon', orbitKm: 583_520, radiusKm: 761.4, periodDays: 13.463 },
      ],
      Neptune: [
        { name: 'Triton', orbitKm: 354_759, radiusKm: 1_353.4, periodDays: 5.877 },
      ],
      Pluto: [
        { name: 'Charon', orbitKm: 19_640, radiusKm: 606.0, periodDays: 6.387 },
      ],
    };

    const moons = moonsByPlanet[planetName];
    if (!moons || moons.length === 0) return;

    const distanceKm = Math.max(1, planetDistanceAu * AU_KM);
    const tDays = currentTime.getTime() / (24 * 60 * 60 * 1000);

    // Visual scaling: real moon separations are sub-pixel at wide FOV.
    const ORBIT_VISUAL_SCALE = 90;
    const MOON_SIZE_SCALE = 18;

    const orbitFlatten = planetName === 'Saturn'
      ? Math.max(0.15, Math.abs(Math.sin(((ringTiltDeg ?? 15) * Math.PI) / 180)))
      : 0.55;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowBlur = 6;
    ctx.shadowColor = nightMode ? 'rgba(255, 190, 190, 0.55)' : 'rgba(220, 235, 255, 0.55)';
    ctx.fillStyle = nightMode ? 'rgba(255, 210, 210, 0.9)' : 'rgba(235, 245, 255, 0.9)';

    // Labels
    ctx.font = 'bold 10px Arial';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 8;
    ctx.shadowColor = 'rgba(0,0,0,0.9)';

    for (let idx = 0; idx < moons.length; idx++) {
      const m = moons[idx];
      const orbitAngleRad = m.orbitKm / distanceKm;
      let orbitPx = (orbitAngleRad / maxAngleRad) * maxRadius * ORBIT_VISUAL_SCALE;
      orbitPx = clamp(orbitPx, planetSizePx * 1.9, planetSizePx * 7.5);
      orbitPx = Math.min(orbitPx, 80 * (120 / fov));

      const moonAngDeg = (2 * Math.atan2(m.radiusKm, distanceKm)) * 180 / Math.PI;
      const moonR = Math.max(1.2, angularDiameterDegToPxRadius(moonAngDeg, MOON_SIZE_SCALE));

      // Evenly space moons around the planet while slowly rotating.
      const a = 2 * Math.PI * (tDays / m.periodDays) + (idx / Math.max(1, moons.length)) * Math.PI * 2;
      const x = planetScreen.x + Math.cos(a) * orbitPx;
      const y = planetScreen.y + Math.sin(a) * orbitPx * orbitFlatten;

      ctx.beginPath();
      ctx.arc(x, y, moonR, 0, Math.PI * 2);
      ctx.fill();

      // Label placed outward from the planet for readability.
      const dx = x - planetScreen.x;
      const dy = y - planetScreen.y;
      const d = Math.max(1e-6, Math.hypot(dx, dy));
      const ux = dx / d;
      const uy = dy / d;
      const labelPad = Math.max(6, moonR + 3);
      const lx = x + ux * labelPad;
      const ly = y + uy * labelPad;
      ctx.fillStyle = nightMode ? 'rgba(255, 210, 210, 0.92)' : 'rgba(240, 248, 255, 0.92)';
      ctx.textAlign = ux >= 0 ? 'left' : 'right';
      ctx.fillText(m.name, lx, ly);
    }

    ctx.restore();
  };

  const planets = getPlanetHorizontalPositions(currentTime, location);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  for (const planet of planets) {
    if (planet.altitude < MIN_RENDER_ALTITUDE_DEG) continue;
    const screen = projectToScreen(planet.altitude, planet.azimuth, width, height, viewAngle, fov);
    if (!screen.visible) continue;

    // Apparent angular sizing.
    // Real planet discs are usually sub-pixel in a wide-FOV view, so we apply a small
    // visual scale and a minimum pixel size while preserving relative sizes.
    const VISUAL_ANGULAR_SCALE = 4.0;
    const minPlanetPx = 2.2 * (120 / fov);
    const size = Math.max(minPlanetPx, angularDiameterDegToPxRadius(planet.angularDiameterDeg, VISUAL_ANGULAR_SCALE));

    // Emit marker for click hit-testing
    if (markers) {
      markers.push({
        name: planet.name,
        x: screen.x,
        y: screen.y,
        radius: Math.max(6, size),
        altitude: planet.altitude,
        azimuth: planet.azimuth,
        magnitude: planet.magnitude,
        distanceAu: planet.distanceAu,
        angularDiameterDeg: planet.angularDiameterDeg,
      });
    }

    // Saturn rings (use ring tilt from Astronomy Engine).
    if (planet.name === 'Saturn') {
      const tiltDeg = planet.ringTiltDeg ?? 12;
      const tiltRad = (tiltDeg * Math.PI) / 180;
      const open = Math.max(0.08, Math.abs(Math.sin(tiltRad)));

      const ringOuter = size * 2.55;
      const ringInner = size * 1.70;
      const ringYScale = open;

      ctx.save();
      ctx.translate(screen.x, screen.y);
      ctx.globalCompositeOperation = 'lighter';

      // Back half (behind the planet)
      ctx.save();
      ctx.beginPath();
      ctx.rect(-9999, -9999, 19998, 9999);
      ctx.clip();
      ctx.lineWidth = Math.max(1, size * 0.22);
      ctx.strokeStyle = nightMode ? 'rgba(255, 190, 190, 0.30)' : 'rgba(250, 230, 190, 0.30)';
      ctx.beginPath();
      ctx.ellipse(0, 0, ringOuter, ringOuter * ringYScale, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = Math.max(1, size * 0.18);
      ctx.strokeStyle = nightMode ? 'rgba(255, 190, 190, 0.22)' : 'rgba(255, 245, 220, 0.22)';
      ctx.beginPath();
      ctx.ellipse(0, 0, ringInner, ringInner * ringYScale, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.restore();
    }

    // Planet disc
    const g = ctx.createRadialGradient(screen.x - size * 0.25, screen.y - size * 0.25, 0, screen.x, screen.y, size * 2);
    const color = planet.color;
    g.addColorStop(0, color);
    g.addColorStop(0.7, color);
    g.addColorStop(1, nightMode ? 'rgba(255, 120, 120, 0)' : 'rgba(255, 255, 255, 0)');
    ctx.shadowBlur = 10;
    ctx.shadowColor = color;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, size, 0, Math.PI * 2);
    ctx.fill();

    // Front half of Saturn rings (in front of the planet)
    if (planet.name === 'Saturn') {
      const tiltDeg = planet.ringTiltDeg ?? 12;
      const tiltRad = (tiltDeg * Math.PI) / 180;
      const open = Math.max(0.08, Math.abs(Math.sin(tiltRad)));

      const ringOuter = size * 2.55;
      const ringInner = size * 1.70;
      const ringYScale = open;

      ctx.save();
      ctx.translate(screen.x, screen.y);
      ctx.globalCompositeOperation = 'lighter';
      ctx.save();
      ctx.beginPath();
      ctx.rect(-9999, 0, 19998, 9999);
      ctx.clip();
      ctx.shadowBlur = 8;
      ctx.shadowColor = nightMode ? 'rgba(255, 190, 190, 0.35)' : 'rgba(255, 235, 190, 0.35)';
      ctx.lineWidth = Math.max(1, size * 0.24);
      ctx.strokeStyle = nightMode ? 'rgba(255, 200, 200, 0.40)' : 'rgba(255, 235, 200, 0.42)';
      ctx.beginPath();
      ctx.ellipse(0, 0, ringOuter, ringOuter * ringYScale, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = Math.max(1, size * 0.20);
      ctx.strokeStyle = nightMode ? 'rgba(255, 200, 200, 0.28)' : 'rgba(255, 250, 230, 0.28)';
      ctx.beginPath();
      ctx.ellipse(0, 0, ringInner, ringInner * ringYScale, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.restore();
    }

    // Jupiter's major 4 moons (Galilean), rendered as small points.
    if (planet.name === 'Jupiter') {
      const moons = getJupiterMoonsHorizontalPositions(currentTime, location);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowBlur = 6;
      ctx.shadowColor = nightMode ? 'rgba(255, 190, 190, 0.55)' : 'rgba(220, 235, 255, 0.55)';
      ctx.fillStyle = nightMode ? 'rgba(255, 200, 200, 0.9)' : 'rgba(230, 240, 255, 0.9)';
      const moonR = Math.max(1.4, 1.8 * (120 / fov));

      // Labels
      ctx.font = 'bold 10px Arial';
      ctx.textBaseline = 'middle';
      ctx.shadowBlur = 8;
      ctx.shadowColor = 'rgba(0,0,0,0.9)';

      for (const m of moons) {
        if (m.altitude < MIN_RENDER_ALTITUDE_DEG) continue;
        const ms = projectToScreen(m.altitude, m.azimuth, width, height, viewAngle, fov);
        if (!ms.visible) continue;
        ctx.beginPath();
        ctx.arc(ms.x, ms.y, moonR, 0, Math.PI * 2);
        ctx.fill();

        // Label outward from Jupiter center.
        const dx = ms.x - screen.x;
        const dy = ms.y - screen.y;
        const d = Math.max(1e-6, Math.hypot(dx, dy));
        const ux = dx / d;
        const uy = dy / d;
        const labelPad = Math.max(6, moonR + 3);
        const lx = ms.x + ux * labelPad;
        const ly = ms.y + uy * labelPad;
        ctx.fillStyle = nightMode ? 'rgba(255, 210, 210, 0.92)' : 'rgba(240, 248, 255, 0.92)';
        ctx.textAlign = ux >= 0 ? 'left' : 'right';
        ctx.fillText(m.name, lx, ly);
      }
      ctx.restore();
    } else {
      // Approximate major moons for other planets (visual context).
      // Uses real planet distance to preserve relative orbital spacing, but not full ephemerides.
      drawApproxMajorMoons(planet.name, planet.color, screen, size, planet.distanceAu, planet.ringTiltDeg);
    }

    // Label
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 6;
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.font = 'bold 12px Arial';
    ctx.fillStyle = nightMode ? 'rgba(255, 190, 190, 0.9)' : 'rgba(240, 248, 255, 0.9)';
    ctx.fillText(planet.name, screen.x + size + 6, screen.y);
    ctx.globalCompositeOperation = 'lighter';
  }

  ctx.restore();
}

function drawSatellites(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  location: ObserverLocation,
  currentTime: Date,
  viewAngle: { altitude: number; azimuth: number },
  fov: number,
  nightMode: boolean,
  group: 'visual' | 'starlink',
  sats: CompiledSatellite[],
  markers?: Array<{
    name: string;
    x: number;
    y: number;
    radius: number;
    altitude: number;
    azimuth: number;
    rangeKm?: number;
    satnum?: number;
    inclinationDeg?: number;
    periodMin?: number;
    meanMotionRevPerDay?: number;
  }>,
  visibleByKey?: Map<string, boolean>
) {
  // Limit count for performance; Starlink can be huge.
  const MAX_SATS = group === 'starlink' ? 650 : 180;

  const pickEven = <T,>(arr: T[], n: number): T[] => {
    if (arr.length <= n) return arr;
    const stride = Math.max(1, Math.floor(arr.length / n));
    const out: T[] = [];
    // IMPORTANT: keep the chosen subset stable over time.
    // Rotating the sample makes satellites appear to "teleport".
    for (let i = 0; i < arr.length && out.length < n; i += stride) out.push(arr[i]);
    // If we didn't hit n because of a weird stride/start combination, fill from front.
    for (let i = 0; i < arr.length && out.length < n; i += 1) out.push(arr[i]);
    return out.slice(0, n);
  };

  const sampled = pickEven(sats, MAX_SATS);
  const positions = computeSatelliteHorizontalPositionsFromSatRecs(sampled, currentTime, location);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.shadowBlur = group === 'starlink' ? 0 : 10;
  ctx.shadowColor = nightMode ? 'rgba(255, 170, 170, 0.6)' : 'rgba(200, 230, 255, 0.65)';

  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
  const fovMarginRad = (group === 'starlink' ? 1.2 : 1.6) * (Math.PI / 180);
  const appearAlt = group === 'starlink' ? 0.9 : 0.6;
  const disappearAlt = group === 'starlink' ? -0.9 : -0.6;

  for (const s of positions) {
    const key = typeof s.satnum === 'number' ? `#${s.satnum}` : s.name;
    const wasVisible = visibleByKey?.get(key) ?? false;

    // Hysteresis at horizon: don't rapidly toggle on/off near 0°.
    const altOk = s.altitude >= appearAlt || (wasVisible && s.altitude >= disappearAlt);
    if (!altOk) {
      if (visibleByKey) visibleByKey.set(key, false);
      continue;
    }

    const screen = projectToScreenWithDistance(s.altitude, s.azimuth, width, height, viewAngle, fov);
    const inFov = screen.visible;
    const inFovH = inFov || (wasVisible && screen.angularDistance <= screen.maxAngle + fovMarginRad);
    if (!inFovH) {
      if (visibleByKey) visibleByKey.set(key, false);
      continue;
    }

    // Fade near FOV edge and near horizon to prevent pop.
    const fovFade = inFov ? 1 : clamp01(1 - (screen.angularDistance - screen.maxAngle) / fovMarginRad);
    const altFade = clamp01((s.altitude - disappearAlt) / (appearAlt - disappearAlt));
    const fade = fovFade * altFade;
    if (visibleByKey) visibleByKey.set(key, fade > 0.05);

    // Brightness: simple elevation-based boost.
    const elevT = Math.max(0, Math.min(1, s.altitude / 90));

    if (group === 'starlink') {
      // Tiny white dots that fill the sky, but clearly brighter than stars.
      // Use constant pixel sizes so FOV changes don't make them effectively invisible.
      const alpha = (0.85 + 0.15 * elevT) * fade;
      const core = 1.35;
      const halo = 7.5;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      const haloGrad = ctx.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, halo);
      haloGrad.addColorStop(0, nightMode ? `rgba(255, 235, 235, ${alpha * 0.55})` : `rgba(245, 250, 255, ${alpha * 0.55})`);
      haloGrad.addColorStop(0.25, nightMode ? `rgba(255, 235, 235, ${alpha * 0.18})` : `rgba(245, 250, 255, ${alpha * 0.18})`);
      haloGrad.addColorStop(1, nightMode ? 'rgba(255, 235, 235, 0)' : 'rgba(245, 250, 255, 0)');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, halo, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = nightMode ? `rgba(255, 255, 255, ${Math.min(1, alpha)})` : `rgba(255, 255, 255, ${Math.min(1, alpha)})`;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, core, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      if (markers) {
        markers.push({
          name: s.name,
          x: screen.x,
          y: screen.y,
          radius: halo,
          altitude: s.altitude,
          azimuth: s.azimuth,
          rangeKm: s.rangeKm,
          satnum: s.satnum,
          inclinationDeg: s.inclinationDeg,
          periodMin: s.periodMin,
          meanMotionRevPerDay: s.meanMotionRevPerDay,
        });
      }
    } else {
      // Visual/stations: brighter with a small glow.
      const alpha = (0.22 + 0.55 * elevT) * fade;
      const r = nightMode ? 255 : 220;
      const g = nightMode ? 190 : 240;
      const b = nightMode ? 190 : 255;

      const size = Math.max(1.6, (120 / fov) * (1.9 + 0.8 * elevT));
      const glow = size * 4.2;

      const grad = ctx.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, glow);
      grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
      grad.addColorStop(0.35, `rgba(${r}, ${g}, ${b}, ${alpha * 0.35})`);
      grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, glow, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${Math.min(1, alpha * 1.2)})`;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, size, 0, Math.PI * 2);
      ctx.fill();

      if (markers) {
        markers.push({
          name: s.name,
          x: screen.x,
          y: screen.y,
          radius: glow,
          altitude: s.altitude,
          azimuth: s.azimuth,
          rangeKm: s.rangeKm,
          satnum: s.satnum,
          inclinationDeg: s.inclinationDeg,
          periodMin: s.periodMin,
          meanMotionRevPerDay: s.meanMotionRevPerDay,
        });
      }
    }
  }

  ctx.restore();
}

function drawComets(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  positions: ReturnType<typeof computeCometHorizontalPositions>,
  viewAngle: { altitude: number; azimuth: number },
  fov: number,
  nightMode: boolean,
  sunAltAz: { altitude: number; azimuth: number },
  elementsByPacked: Map<string, CometElements>,
  visibleByPacked: Map<string, boolean>,
  markers?: Array<{
    name: string;
    packed: string;
    x: number;
    y: number;
    radius: number;
    altitude: number;
    azimuth: number;
    helioDistanceAu?: number;
    geoDistanceAu?: number;
    perihelionDistanceAu?: number;
    eccentricity?: number;
    perihelionTimeUtc?: string;
  }>
) {
  // Match Starlink styling: tiny constant-size bright dots + a small tail.
  const baseScale = Math.max(0.85, Math.min(1.25, 120 / fov));
  const DEG2RAD = Math.PI / 180;
  const RAD2DEG = 180 / Math.PI;
  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

  const horizToENU = (altDeg: number, azDeg: number) => {
    const alt = altDeg * DEG2RAD;
    const az = azDeg * DEG2RAD;
    const cosAlt = Math.cos(alt);
    return {
      x: cosAlt * Math.sin(az), // east
      y: cosAlt * Math.cos(az), // north
      z: Math.sin(alt),
    };
  };

  const enuToHoriz = (v: { x: number; y: number; z: number }) => {
    const alt = Math.asin(Math.max(-1, Math.min(1, v.z)));
    const az = Math.atan2(v.x, v.y);
    const azDeg = ((az * RAD2DEG) % 360 + 360) % 360;
    return { altitude: alt * RAD2DEG, azimuth: azDeg };
  };

  const norm = (v: { x: number; y: number; z: number }) => {
    const m = Math.hypot(v.x, v.y, v.z);
    if (m < 1e-9) return null;
    return { x: v.x / m, y: v.y / m, z: v.z / m };
  };

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.shadowBlur = 0;

  const sunVec = horizToENU(sunAltAz.altitude, sunAltAz.azimuth);
  const fovMarginRad = 1.2 * (Math.PI / 180);
  const appearAlt = 1.0;
  const disappearAlt = -1.0;

  for (const p of positions) {
    const wasVisible = visibleByPacked.get(p.packed) ?? false;

    const altOk = p.altitude >= appearAlt || (wasVisible && p.altitude >= disappearAlt);
    if (!altOk) {
      visibleByPacked.set(p.packed, false);
      continue;
    }

    const screen = projectToScreenWithDistance(p.altitude, p.azimuth, width, height, viewAngle, fov);
    const inFov = screen.visible;
    const inFovH = inFov || (wasVisible && screen.angularDistance <= screen.maxAngle + fovMarginRad);
    if (!inFovH) {
      visibleByPacked.set(p.packed, false);
      continue;
    }

    const weight = estimateCometVisualWeight(p);

    const fovFade = inFov ? 1 : clamp01(1 - (screen.angularDistance - screen.maxAngle) / fovMarginRad);
    const altFade = clamp01((p.altitude - disappearAlt) / (appearAlt - disappearAlt));
    const horizonFade = fovFade * altFade;
    visibleByPacked.set(p.packed, horizonFade > 0.05);

    // Tail physics: comets have (mostly) anti-solar tails.
    // Compute a tangent direction on the sky away from the Sun (stable, non-random).
    const cometVec = horizToENU(p.altitude, p.azimuth);
    const v = { x: cometVec.x - sunVec.x, y: cometVec.y - sunVec.y, z: cometVec.z - sunVec.z };
    const dot = cometVec.x * v.x + cometVec.y * v.y + cometVec.z * v.z;
    const proj = { x: v.x - cometVec.x * dot, y: v.y - cometVec.y * dot, z: v.z - cometVec.z * dot };
    const dir = norm(proj) ?? { x: 1, y: 0, z: 0 };

    // Project a nearby point along the tail direction to get a screen-space direction.
    const eps = 0.012; // ~0.7°
    const near = norm({ x: cometVec.x + dir.x * eps, y: cometVec.y + dir.y * eps, z: cometVec.z + dir.z * eps }) ?? cometVec;
    const nearHoriz = enuToHoriz(near);
    const nearScreen = projectToScreen(nearHoriz.altitude, nearHoriz.azimuth, width, height, viewAngle, fov);

    let ux = 1;
    let uy = 0;
    if (nearScreen.visible) {
      const dx = nearScreen.x - screen.x;
      const dy = nearScreen.y - screen.y;
      const d = Math.hypot(dx, dy);
      if (d > 1e-6) {
        ux = dx / d;
        uy = dy / d;
      }
    }

    // Tail extends *behind* the comet (opposite its apparent travel direction).
    // Here, ux/uy already points away from the Sun, so extend in that direction.
    const tailLen = (14 + 52 * weight) * baseScale;
    const tx = screen.x + ux * tailLen;
    const ty = screen.y + uy * tailLen;

    const tailGrad = ctx.createLinearGradient(screen.x, screen.y, tx, ty);
    const tailA = (0.10 + 0.45 * weight) * horizonFade;
    tailGrad.addColorStop(0, nightMode ? `rgba(255, 235, 235, ${tailA})` : `rgba(245, 250, 255, ${tailA})`);
    tailGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.strokeStyle = tailGrad;
    ctx.lineWidth = (1.4 + 2.6 * weight) * horizonFade;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(screen.x, screen.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();

    // Head (Starlink-like)
    const alpha = (0.80 + 0.20 * weight) * horizonFade;
    const core = 1.35;
    const halo = 7.5;

    const haloGrad = ctx.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, halo);
    haloGrad.addColorStop(0, nightMode ? `rgba(255, 235, 235, ${alpha * 0.55})` : `rgba(245, 250, 255, ${alpha * 0.55})`);
    haloGrad.addColorStop(0.25, nightMode ? `rgba(255, 235, 235, ${alpha * 0.18})` : `rgba(245, 250, 255, ${alpha * 0.18})`);
    haloGrad.addColorStop(1, nightMode ? 'rgba(255, 235, 235, 0)' : 'rgba(245, 250, 255, 0)');
    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, halo, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = nightMode ? `rgba(255, 255, 255, ${Math.min(1, alpha)})` : `rgba(255, 255, 255, ${Math.min(1, alpha)})`;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, core, 0, Math.PI * 2);
    ctx.fill();

    if (markers) {
      const meta = p.packed ? elementsByPacked.get(p.packed) : undefined;
      markers.push({
        name: p.name,
        packed: p.packed,
        x: screen.x,
        y: screen.y,
        radius: 10,
        altitude: p.altitude,
        azimuth: p.azimuth,
        helioDistanceAu: p.helioDistanceAu,
        geoDistanceAu: p.geoDistanceAu,
        perihelionDistanceAu: meta?.perihelionDistanceAu,
        eccentricity: meta?.eccentricity,
        perihelionTimeUtc: meta?.perihelionTimeUtc,
      });
    }
  }

  ctx.restore();
}

function drawSunMarker(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  altitude: number,
  azimuth: number,
  viewAngle: { altitude: number; azimuth: number },
  fov: number,
  nightMode: boolean,
  radius: number,
  currentTime: Date
) {
  if (altitude < MIN_RENDER_ALTITUDE_DEG) return;
  const screen = projectToScreen(altitude, azimuth, width, height, viewAngle, fov);
  if (!screen.visible) return;

  const base = nightMode ? 'rgba(255, 170, 170, 0.9)' : 'rgba(255, 235, 160, 0.95)';
  const edge = nightMode ? 'rgba(255, 120, 120, 0.85)' : 'rgba(255, 190, 80, 0.9)';
  const corona = nightMode ? 'rgba(255, 130, 130, 0.55)' : 'rgba(255, 220, 140, 0.6)';

  ctx.save();
  ctx.translate(screen.x, screen.y);
  ctx.globalCompositeOperation = 'lighter';

  // Corona glow
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 3.0);
  glow.addColorStop(0, corona);
  glow.addColorStop(0.25, corona.replace(/[\d.]+\)$/, '0.25)'));
  glow.addColorStop(1, corona.replace(/[\d.]+\)$/, '0)'));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 3.0, 0, Math.PI * 2);
  ctx.fill();

  // Sun disc with limb darkening
  const disc = ctx.createRadialGradient(0, 0, radius * 0.1, 0, 0, radius);
  disc.addColorStop(0, base);
  disc.addColorStop(0.7, base);
  disc.addColorStop(1, edge);
  ctx.shadowBlur = 14;
  ctx.shadowColor = corona;
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  // Granulation texture (deterministic per day)
  let seed = Math.floor(currentTime.getTime() / (24 * 60 * 60 * 1000)) ^ 0x5a17;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return seed / 0xffffffff;
  };
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.globalAlpha = nightMode ? 0.18 : 0.16;
  for (let i = 0; i < 120; i++) {
    const a = rand() * Math.PI * 2;
    const rr = Math.sqrt(rand()) * radius;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    const s = 0.8 + rand() * 2.5;
    ctx.fillStyle = nightMode ? 'rgba(255, 120, 120, 0.55)' : 'rgba(255, 255, 220, 0.55)';
    ctx.beginPath();
    ctx.arc(x, y, s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Subtle corona rays
  ctx.save();
  ctx.globalAlpha = nightMode ? 0.22 : 0.18;
  ctx.strokeStyle = corona;
  ctx.lineWidth = 1;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + (seed % 1000) * 0.0002;
    const inner = radius * (1.05 + rand() * 0.05);
    const outer = radius * (1.65 + rand() * 0.55);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
    ctx.stroke();
  }
  ctx.restore();

  ctx.restore();
}

function drawMoonMarker(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  altitude: number,
  azimuth: number,
  viewAngle: { altitude: number; azimuth: number },
  fov: number,
  nightMode: boolean,
  radius: number,
  currentTime: Date,
  sun: { altitude: number; azimuth: number },
  illumination: number,
  phaseAngleDeg: number
) {
  if (altitude < MIN_RENDER_ALTITUDE_DEG) return;
  const screen = projectToScreen(altitude, azimuth, width, height, viewAngle, fov);
  if (!screen.visible) return;

  // Use unclamped projection so the terminator stays correctly oriented
  // even when the Sun is off-screen.
  const sunScreen = projectToScreenUnclamped(sun.altitude, sun.azimuth, width, height, viewAngle, fov);
  const lx = sunScreen.x - screen.x;
  const ly = sunScreen.y - screen.y;
  const len = Math.max(1e-6, Math.hypot(lx, ly));
  const dirX = lx / len;
  const dirY = ly / len;

  // Opaque base prevents a bright antialias fringe from reading as an outer ring.
  const rim = nightMode ? 'rgba(245, 230, 230, 1.0)' : 'rgba(245, 248, 255, 1.0)';
  const mid = nightMode ? 'rgba(225, 210, 210, 1.0)' : 'rgba(220, 230, 240, 1.0)';

  ctx.save();
  ctx.translate(screen.x, screen.y);
  ctx.globalCompositeOperation = 'source-over';

  // Base disc with a tiny directional highlight toward the Sun.
  const hx = dirX * radius * 0.25;
  const hy = dirY * radius * 0.25;
  const disc = ctx.createRadialGradient(hx, hy, radius * 0.1, 0, 0, radius);
  disc.addColorStop(0, rim);
  disc.addColorStop(0.6, mid);
  disc.addColorStop(1, nightMode ? 'rgba(180, 90, 90, 1.0)' : 'rgba(170, 180, 190, 1.0)');
  // Remove the outer glow/outline around the Moon.
  ctx.shadowBlur = 0;
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  // Stable lunar surface texture (fixed map; avoids "crawling" over time).
  const surface = getMoonSurfaceTextureCanvas();
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.globalAlpha = nightMode ? 0.70 : 0.80;
  ctx.drawImage(surface, -radius, -radius, radius * 2, radius * 2);
  ctx.restore();

  // Accurate phase + terminator alignment: physical illumination mask from the real phase angle.
  const safePhase = Number.isFinite(phaseAngleDeg)
    ? phaseAngleDeg
    : (() => {
        const illum = Math.max(0, Math.min(1, illumination));
        const cosi = Math.max(-1, Math.min(1, 2 * illum - 1));
        return (Math.acos(cosi) * 180) / Math.PI;
      })();

  const lighting = getMoonLightingCanvas(safePhase);
  const lightAngle = Math.atan2(dirY, dirX);
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.rotate(lightAngle);
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 1.0;
  ctx.drawImage(lighting, -radius, -radius, radius * 2, radius * 2);
  ctx.restore();

  // Limb glow removed (it reads as a white outline at small sizes).

  ctx.restore();
}

// Helper: Draw all constellation lines from GeoJSON data (88 constellations)
function drawAllConstellationLines(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  constellations: ConstellationLineSegment[],
  location: ObserverLocation,
  currentTime: Date,
  viewAngle: { altitude: number; azimuth: number },
  fov: number,
  nightMode: boolean
) {
  ctx.strokeStyle = nightMode ? 'rgba(200, 100, 100, 0.35)' : 'rgba(74, 144, 226, 0.4)';
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';
  
  constellations.forEach(constellation => {
    // Skip faint constellations if rank is 3 and we have narrow FOV
    if (constellation.rank === '3' && fov < 90) {
      return; // Only show prominent constellations at narrow FOV
    }
    
    constellation.lines.forEach(line => {
      if (line.points.length < 2) return;
      
      let prevScreen: { x: number; y: number; visible: boolean } | null = null;
      
      // Draw line segments between points
      for (let i = 0; i < line.points.length; i++) {
        const point = line.points[i];
        
        // Convert lon/lat to RA/Dec (longitude = RA, latitude = Dec)
        const ra = point.lon < 0 ? point.lon + 360 : point.lon;
        const dec = point.lat;
        
        // Convert to horizontal coordinates
        const horiz = equatorialToHorizontal({ra, dec}, location, currentTime);
        
        // Project to screen
        const screen = projectToScreen(horiz.altitude, horiz.azimuth, width, height, viewAngle, fov);
        
        // Draw line segment if both points are visible
        if (prevScreen && prevScreen.visible && screen.visible) {
          ctx.beginPath();
          ctx.moveTo(prevScreen.x, prevScreen.y);
          ctx.lineTo(screen.x, screen.y);
          ctx.stroke();
        }
        
        prevScreen = screen;
      }
    });
  });
}

// Helper: Draw all constellation labels
function drawAllConstellationLabels(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  constellations: ConstellationLineSegment[],
  location: ObserverLocation,
  currentTime: Date,
  viewAngle: { altitude: number; azimuth: number },
  fov: number,
  nightMode: boolean
) {
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowBlur = 4;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  
  constellations.forEach(constellation => {
    // Skip faint constellations at narrow FOV
    if (constellation.rank === '3' && fov < 90) {
      return;
    }
    
    // Get the first line's first point as label position
    if (constellation.lines.length === 0 || constellation.lines[0].points.length === 0) {
      return;
    }
    
    const firstPoint = constellation.lines[0].points[0];
    const ra = firstPoint.lon < 0 ? firstPoint.lon + 360 : firstPoint.lon;
    const dec = firstPoint.lat;
    
    // Convert to horizontal coordinates
    const horiz = equatorialToHorizontal({ra, dec}, location, currentTime);
    
    // Allow labels below the horizon too (full-sphere view)
    if (horiz.altitude < MIN_RENDER_ALTITUDE_DEG) return;
    
    // Project to screen
    const screen = projectToScreen(horiz.altitude, horiz.azimuth, width, height, viewAngle, fov);
    
    if (!screen.visible) return;

    // Fade labels when below horizon so they don't dominate
    let alphaMul = 1;
    if (horiz.altitude < 0) {
      const t = Math.max(0, Math.min(1, (horiz.altitude - MIN_RENDER_ALTITUDE_DEG) / (0 - MIN_RENDER_ALTITUDE_DEG)));
      alphaMul = 0.35 + 0.65 * t;
    }
    
    // Draw label with color based on rank
    if (constellation.rank === '1') {
      ctx.fillStyle = nightMode ? 'rgba(255, 180, 180, 0.9)' : 'rgba(100, 180, 255, 0.9)';
      ctx.font = 'bold 15px Arial';
    } else if (constellation.rank === '2') {
      ctx.fillStyle = nightMode ? 'rgba(255, 150, 150, 0.7)' : 'rgba(150, 200, 255, 0.7)';
      ctx.font = 'bold 13px Arial';
    } else {
      ctx.fillStyle = nightMode ? 'rgba(255, 120, 120, 0.5)' : 'rgba(180, 210, 255, 0.5)';
      ctx.font = '12px Arial';
    }

    ctx.save();
    ctx.globalAlpha = alphaMul;
    ctx.fillText(constellation.name, screen.x, screen.y);
    ctx.restore();
  });
  
  ctx.shadowBlur = 0;
}

// Helper: Draw constellation lines (old, for backwards compatibility)
function drawConstellationLines(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  starPositions: Array<{ altitude: number; azimuth: number; visible: boolean }>,
  viewAngle: { altitude: number; azimuth: number },
  fov: number,
  nightMode: boolean
) {
  ctx.strokeStyle = nightMode ? 'rgba(200, 100, 100, 0.4)' : 'rgba(74, 144, 226, 0.5)';
  ctx.lineWidth = 1.5;
  
  constellationLines.forEach(line => {
    const fromIndex = constellationStars.findIndex(s => s.id === line.from);
    const toIndex = constellationStars.findIndex(s => s.id === line.to);
    
    if (fromIndex === -1 || toIndex === -1) return;
    
    const fromPos = starPositions[fromIndex];
    const toPos = starPositions[toIndex];
    if (fromPos.altitude < MIN_RENDER_ALTITUDE_DEG || toPos.altitude < MIN_RENDER_ALTITUDE_DEG) return;
    
    const fromScreen = projectToScreen(fromPos.altitude, fromPos.azimuth, width, height, viewAngle, fov);
    const toScreen = projectToScreen(toPos.altitude, toPos.azimuth, width, height, viewAngle, fov);
    
    if (!fromScreen.visible || !toScreen.visible) return;
    
    ctx.beginPath();
    ctx.moveTo(fromScreen.x, fromScreen.y);
    ctx.lineTo(toScreen.x, toScreen.y);
    ctx.stroke();
  });
}

// Helper: Draw constellation labels
function drawConstellationLabels(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  starPositions: Array<{ altitude: number; azimuth: number; visible: boolean }>,
  viewAngle: { altitude: number; azimuth: number },
  fov: number,
  nightMode: boolean
) {
  const constellations = new Map<string, { x: number; y: number; count: number }>();
  
  // Calculate center position for each constellation
  constellationStars.forEach((star, index) => {
    const pos = starPositions[index];
    if (pos.altitude < MIN_RENDER_ALTITUDE_DEG) return;
    
    const screen = projectToScreen(pos.altitude, pos.azimuth, width, height, viewAngle, fov);
    if (!screen.visible) return;
    
    const existing = constellations.get(star.constellation);
    if (existing) {
      existing.x += screen.x;
      existing.y += screen.y;
      existing.count++;
    } else {
      constellations.set(star.constellation, { x: screen.x, y: screen.y, count: 1 });
    }
  });
  
  // Draw labels
  ctx.font = '14px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  constellations.forEach((data, name) => {
    const x = data.x / data.count;
    const y = data.y / data.count;
    
    // Draw text shadow for readability
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillText(name, x + 1, y + 1);
    
    // Draw text
    ctx.fillStyle = nightMode ? 'rgba(255, 150, 150, 0.8)' : 'rgba(150, 200, 255, 0.9)';
    ctx.fillText(name, x, y);
  });
}

// Helper: Draw azimuthal grid
function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  viewAngle: { altitude: number; azimuth: number },
  fov: number = 120
) {
  ctx.strokeStyle = 'rgba(100, 100, 100, 0.25)';
  ctx.lineWidth = 1;
  
  // Draw altitude circles (every 15 degrees) with proper visibility checking
  for (let alt = -75; alt <= 75; alt += 15) {
    if (alt === 0) continue; // horizon is drawn separately
    ctx.beginPath();
    let pathStarted = false;
    
    for (let az = 0; az <= 360; az += 3) {
      const screen = projectToScreen(alt, az, width, height, viewAngle, fov);
      
      if (screen.visible) {
        if (!pathStarted) {
          ctx.moveTo(screen.x, screen.y);
          pathStarted = true;
        } else {
          ctx.lineTo(screen.x, screen.y);
        }
      } else {
        // Reset path when point becomes invisible
        if (pathStarted) {
          ctx.stroke();
          ctx.beginPath();
          pathStarted = false;
        }
      }
    }
    
    if (pathStarted) {
      ctx.closePath();
      ctx.stroke();
    }
  }
  
  // Draw azimuth lines (every 30 degrees) with proper visibility checking
  for (let az = 0; az < 360; az += 30) {
    ctx.beginPath();
    let pathStarted = false;
    
    for (let alt = MIN_RENDER_ALTITUDE_DEG; alt <= 90; alt += 3) {
      const screen = projectToScreen(alt, az, width, height, viewAngle, fov);
      
      if (screen.visible) {
        if (!pathStarted) {
          ctx.moveTo(screen.x, screen.y);
          pathStarted = true;
        } else {
          ctx.lineTo(screen.x, screen.y);
        }
      } else {
        // Reset path when point becomes invisible
        if (pathStarted) {
          ctx.stroke();
          ctx.beginPath();
          pathStarted = false;
        }
      }
    }
    
    if (pathStarted) {
      ctx.stroke();
    }
  }
}

// Helper: Get star color
function getStarColor(magnitude: number): string {
  if (magnitude < -1) return 'rgb(255, 255, 255)';
  if (magnitude < 0) return 'rgb(255, 255, 238)';
  if (magnitude < 1) return 'rgb(255, 255, 221)';
  if (magnitude < 2) return 'rgb(255, 244, 221)';
  if (magnitude < 3) return 'rgb(238, 238, 255)';
  if (magnitude < 4) return 'rgb(221, 238, 255)';
  return 'rgb(204, 221, 255)';
}

// Helper: Get star color for night mode
function getStarColorNightMode(magnitude: number): string {
  if (magnitude < -1) return 'rgb(255, 200, 200)';
  if (magnitude < 0) return 'rgb(255, 180, 180)';
  if (magnitude < 1) return 'rgb(255, 160, 160)';
  if (magnitude < 2) return 'rgb(255, 140, 140)';
  if (magnitude < 3) return 'rgb(255, 120, 120)';
  if (magnitude < 4) return 'rgb(220, 100, 100)';
  return 'rgb(200, 80, 80)';
}
