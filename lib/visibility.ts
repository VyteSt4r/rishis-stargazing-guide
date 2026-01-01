export const BORTLE_LIMITING_MAG: number[] = [8.0, 7.6, 7.1, 6.6, 6.1, 5.6, 5.1, 4.6, 4.1];

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export type SkyVisibilityInputs = {
  bortleScale: number; // 1..9
  sunAltitudeDeg: number; // deg
  moonAltitudeDeg?: number; // deg
  moonIlluminationFrac?: number; // 0..1
};

export type TargetVisibilityInputs = SkyVisibilityInputs & {
  targetAltitudeDeg: number;
};

export function twilightFactor(sunAltitudeDeg: number): number {
  // 0 at civil twilight (-6°) and brighter; 1 at astronomical night (-18°) and darker.
  return clamp01((-sunAltitudeDeg - 6) / 12);
}

export function moonWashFactor(moonAltitudeDeg?: number, moonIlluminationFrac?: number): number {
  if (!Number.isFinite(moonAltitudeDeg) || !Number.isFinite(moonIlluminationFrac)) return 0;
  const alt = moonAltitudeDeg as number;
  const illum = clamp01(moonIlluminationFrac as number);
  // Moonlight contribution grows with illumination and when the Moon is above the horizon.
  // Keep it gentle: this is a perceptual factor, not a physical luminance model.
  const above = clamp01((alt + 2) / 22); // ~0 below ~-2°, ~1 above ~20°
  return clamp01(illum * (0.35 + 0.65 * above));
}

export function getBortleLimitingMagnitude(bortleScale: number): number {
  const idx = Math.round(bortleScale) - 1;
  return BORTLE_LIMITING_MAG[idx] ?? 6.0;
}

export function effectiveNakedEyeLimitingMagnitude(inputs: SkyVisibilityInputs): number {
  const base = getBortleLimitingMagnitude(inputs.bortleScale);
  const tw = twilightFactor(inputs.sunAltitudeDeg);
  const mw = moonWashFactor(inputs.moonAltitudeDeg, inputs.moonIlluminationFrac);

  // Blend between \"only bright stars\" in twilight and the Bortle-based limit at night.
  // At tw=0 (sun >= -6°): ~mag 2.5. At tw=1 (sun <= -18°): base.
  let lim = lerp(2.5, base, tw);

  // Moonlight reduces limiting magnitude by up to ~2 mags.
  lim -= 2.0 * mw;
  return Math.max(-1.5, Math.min(9.0, lim));
}

export function airmassKastenYoung(altitudeDeg: number): number {
  // Kasten & Young 1989. Valid down to ~-5° but we clamp to avoid singularities.
  if (!Number.isFinite(altitudeDeg)) return Infinity;
  if (altitudeDeg <= -5) return Infinity;
  const alt = Math.max(-4.9, Math.min(90, altitudeDeg));
  const altRad = (alt * Math.PI) / 180;
  const sinAlt = Math.sin(altRad);
  const denom = sinAlt + 0.50572 * Math.pow(alt + 6.07995, -1.6364);
  return 1 / Math.max(1e-6, denom);
}

export function extinctionDeltaMagnitude(altitudeDeg: number, kMagPerAirmass: number = 0.20): number {
  if (altitudeDeg <= 0) return 10;
  const X = airmassKastenYoung(altitudeDeg);
  // Use (X - 1) so objects at zenith are unaffected.
  return Math.max(0, kMagPerAirmass * Math.max(0, X - 1));
}

export function starVisibility(
  starMagnitude: number,
  inputs: TargetVisibilityInputs,
  opts?: { extinctionK?: number; marginMag?: number }
): { visible: boolean; effectiveMagnitude: number; limitingMagnitude: number; alphaScale: number } {
  const limitingMagnitude = effectiveNakedEyeLimitingMagnitude(inputs);
  const extinctionK = opts?.extinctionK ?? 0.20;
  const marginMag = opts?.marginMag ?? 0.20;

  const ext = extinctionDeltaMagnitude(inputs.targetAltitudeDeg, extinctionK);
  const effectiveMagnitude = starMagnitude + ext;

  const tw = twilightFactor(inputs.sunAltitudeDeg);
  const mw = moonWashFactor(inputs.moonAltitudeDeg, inputs.moonIlluminationFrac);

  // A global transparency factor (0..1-ish) that affects contrast for all stars.
  const alphaScale = clamp01(tw * (1 - 0.70 * mw));

  const visible = effectiveMagnitude <= limitingMagnitude + marginMag;
  return { visible, effectiveMagnitude, limitingMagnitude, alphaScale };
}

export function estimateSkyBackgroundMagArcsec2(limitingMagnitude: number): number {
  // Rough perceptual mapping: brighter skies → smaller LM, smaller mag/arcsec^2.
  // Calibrated loosely so LM≈4 → ~19, LM≈6 → ~20.6, LM≈8 → ~22.2.
  const lm = Math.max(0, Math.min(9, limitingMagnitude));
  return 19.0 + (lm - 4.0) * 0.80;
}

export function dsoDetectability(
  dso: { magnitude: number; sizeArcmin: number },
  inputs: TargetVisibilityInputs,
  opts?: { extinctionK?: number }
): { visible: boolean; alpha: number; surfaceBrightnessMagArcsec2: number; skyBackgroundMagArcsec2: number } {
  const limitingMagnitude = effectiveNakedEyeLimitingMagnitude(inputs);
  const extinctionK = opts?.extinctionK ?? 0.20;

  const tw = twilightFactor(inputs.sunAltitudeDeg);
  const mw = moonWashFactor(inputs.moonAltitudeDeg, inputs.moonIlluminationFrac);

  const ext = extinctionDeltaMagnitude(inputs.targetAltitudeDeg, extinctionK);

  const size = Math.max(0.2, dso.sizeArcmin);
  const areaArcmin2 = Math.PI * Math.pow(size / 2, 2);

  // Surface brightness estimate (mag/arcmin^2) from total magnitude and area.
  const sbMagArcmin2 = (dso.magnitude + ext) + 2.5 * Math.log10(Math.max(1e-6, areaArcmin2));
  const sbMagArcsec2 = sbMagArcmin2 + 8.89; // 2.5*log10(3600)

  const skyBg = estimateSkyBackgroundMagArcsec2(limitingMagnitude);

  // Contrast proxy: DSOs become harder when their surface brightness is much fainter than the sky.
  const contrast = (skyBg + 1.2) - sbMagArcsec2; // positive = easier

  const altBoost = clamp01((inputs.targetAltitudeDeg + 2) / 25);
  const raw = clamp01((contrast + 1.0) / 3.0);
  const alpha = clamp01(raw * altBoost * tw * (1 - 0.85 * mw));

  // Visibility gate: keep fairly strict to reduce "always visible" DSOs.
  const visible = alpha > 0.12;
  return { visible, alpha, surfaceBrightnessMagArcsec2: sbMagArcsec2, skyBackgroundMagArcsec2: skyBg };
}
