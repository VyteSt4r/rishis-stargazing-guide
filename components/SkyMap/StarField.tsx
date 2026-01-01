'use client';

import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { horizontalToCartesian } from '@/lib/astronomyUtils';

interface Star {
  id: string | number;
  ra: number;
  dec: number;
  mag: number;
  bv: number;
  name?: string;
}

interface StarFieldProps {
  stars: Star[];
  starPositions: Array<{ altitude: number; azimuth: number; visible: boolean }>;
  bortleScale: number;
  sunAltitude: number;
  onStarClick?: (star: Star) => void;
}

// Get star color from B-V index
function getStarColorFromBV(bv: number): THREE.Color {
  if (bv < -0.3) return new THREE.Color('#9bb0ff');
  if (bv < -0.02) return new THREE.Color('#aabfff');
  if (bv < 0.3) return new THREE.Color('#cad7ff');
  if (bv < 0.6) return new THREE.Color('#fbf8ff');
  if (bv < 0.82) return new THREE.Color('#fff4e8');
  if (bv < 1.4) return new THREE.Color('#ffd2a1');
  return new THREE.Color('#ffcc6f');
}

const vertexShader = `
  attribute float aMagnitude;
  attribute float aAltitude;
  attribute float aSeed;
  attribute vec3 color;

  uniform float uTime;
  uniform float uBaseSize;
  uniform float uTwinkleStrength;

  varying vec3 vColor;
  varying float vTwinkle;

  void main() {
    vColor = color;

    // Twinkle is mostly near the horizon.
    float horizon = clamp(1.0 - (aAltitude / 25.0), 0.0, 1.0);
    float tw = 1.0 + uTwinkleStrength * horizon * (0.5 + 0.5 * sin(uTime * 2.2 + aSeed * 11.7));
    vTwinkle = tw;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float distScale = 1.0 / max(0.1, -mvPosition.z);
    float magScale = pow(10.0, -0.4 * aMagnitude);

    // Stellarium-like magnitude scaling (logarithmic).
    float size = uBaseSize * magScale * distScale;
    gl_PointSize = clamp(size, 0.0, 90.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = `
  precision highp float;

  varying vec3 vColor;
  varying float vTwinkle;

  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float r = length(uv);

    // Gaussian-ish PSF: tight core + faint halo.
    float core = exp(-r * r * 18.0);
    float halo = exp(-r * r * 4.0) * 0.35;
    float a = (core + halo);

    // Soft edge to avoid square sprites.
    a *= smoothstep(0.55, 0.0, r);
    a *= vTwinkle;

    gl_FragColor = vec4(vColor, a);
  }
`;

export function StarField({ stars, starPositions, bortleScale, sunAltitude, onStarClick }: StarFieldProps) {
  const pointsRef = useRef<THREE.Points>(null);

  // Create star geometry attributes
  const { positions, colors, magnitudes, altitudes, seeds, indexToStar } = useMemo(() => {
    const posArray: number[] = [];
    const colorArray: number[] = [];
    const magArray: number[] = [];
    const altArray: number[] = [];
    const seedArray: number[] = [];
    const indexMap: Star[] = [];
    
    stars.forEach((star, index) => {
      const pos = starPositions[index];
      if (!pos || !pos.visible || pos.altitude < 0) return;
      
      // Calculate brightness and visibility
      const brightness = Math.pow(2.512, -star.mag);
      const limitingMag = [8.0, 7.6, 7.1, 6.6, 6.1, 5.6, 5.1, 4.6, 4.1][bortleScale - 1] || 6.0;
      
      // During daytime (sun > -6°), only show very bright stars
      const isDaytime = sunAltitude > -6;
      const dayLimitingMag = isDaytime ? 1.0 : limitingMag; // Only brightest stars during day
      
      if (star.mag > dayLimitingMag) return;
      
      // Convert to 3D position
      const cart = horizontalToCartesian(pos.altitude, pos.azimuth, 1000);
      posArray.push(cart.x, cart.y, cart.z);
      
      // Color from B-V index
      const color = getStarColorFromBV(star.bv);
      
      // Fade stars as the Sun rises (keep subtle; PSF + bloom does the rest)
      const daytimeFactor = sunAltitude > 0 ? Math.max(0.0, 1 - (sunAltitude / 18)) : 1.0;
      const fade = THREE.MathUtils.clamp(daytimeFactor, 0, 1);

      colorArray.push(color.r * fade, color.g * fade, color.b * fade);

      // Shader attributes
      magArray.push(star.mag);
      altArray.push(pos.altitude);
      const s = (typeof star.id === 'number' ? star.id : index) * 0.001 + index * 0.17;
      seedArray.push(s);
      indexMap.push(star);
    });
    
    return {
      positions: new Float32Array(posArray),
      colors: new Float32Array(colorArray),
      magnitudes: new Float32Array(magArray),
      altitudes: new Float32Array(altArray),
      seeds: new Float32Array(seedArray),
      indexToStar: indexMap,
    };
  }, [stars, starPositions, bortleScale, sunAltitude]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBaseSize: { value: 160.0 },
      uTwinkleStrength: { value: 0.08 },
    }),
    []
  );
  
  // Update positions on time change
  useFrame(({ clock }) => {
    uniforms.uTime.value = clock.getElapsedTime();
  });

  // Keep geometry attributes stable and update when buffers change.
  useEffect(() => {
    if (!pointsRef.current) return;
    pointsRef.current.geometry.computeBoundingSphere();
  }, [positions, colors, magnitudes, altitudes, seeds]);

  const handlePointerDown = (e: any) => {
    if (!onStarClick) return;
    const idx = e.index as number | undefined;
    if (typeof idx !== 'number') return;
    const star = indexToStar[idx];
    if (star) onStarClick(star);
  };
  
  return (
    <points ref={pointsRef} onPointerDown={handlePointerDown}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        <bufferAttribute attach="attributes-aMagnitude" args={[magnitudes, 1]} />
        <bufferAttribute attach="attributes-aAltitude" args={[altitudes, 1]} />
        <bufferAttribute attach="attributes-aSeed" args={[seeds, 1]} />
      </bufferGeometry>
      <shaderMaterial
        transparent
        depthWrite={false}
        depthTest={false}
        blending={THREE.AdditiveBlending}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </points>
  );
}
