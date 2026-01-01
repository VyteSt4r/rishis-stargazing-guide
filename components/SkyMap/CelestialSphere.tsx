'use client';

import * as THREE from 'three';
import { useMemo } from 'react';
import { Sky } from '@react-three/drei';
import { horizontalToCartesian } from '@/lib/astronomyUtils';

interface CelestialSphereProps {
  showGround?: boolean;
  showGrid?: boolean;
  atmosphericColor: { zenith: string; horizon: string; intensity: number };
  sunAltitude: number;
  sunAzimuth: number;
}

export function CelestialSphere({ showGround = true, showGrid = true, atmosphericColor, sunAltitude, sunAzimuth }: CelestialSphereProps) {
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

  // Procedural 360 panorama texture (no external assets).
  const panoramaTexture = useMemo(() => {
    const w = 2048;
    const h = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    // Base gradient: darker zenith, slightly lighter horizon.
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0.0, '#000000');
    grad.addColorStop(0.55, '#000108');
    grad.addColorStop(0.78, '#02020a');
    grad.addColorStop(1.0, '#000000');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Add subtle horizon silhouette.
    ctx.fillStyle = 'rgba(0,0,0,0.95)';
    ctx.beginPath();
    const horizonY = Math.floor(h * 0.73);
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 24) {
      const bump = Math.sin(x * 0.02) * 6 + Math.sin(x * 0.07) * 3;
      ctx.lineTo(x, horizonY + bump);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // A few very dim far lights near horizon (subtle).
    for (let i = 0; i < 140; i++) {
      const x = Math.random() * w;
      const y = horizonY + 10 + Math.random() * (h - horizonY - 20);
      const a = 0.03 + Math.random() * 0.06;
      ctx.fillStyle = `rgba(255, 220, 170, ${a})`;
      ctx.fillRect(x, y, 1, 1);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }, []);

  // Sun direction in world coords for Preetham sky.
  const sunDir = useMemo(() => {
    const v = horizontalToCartesian(sunAltitude, sunAzimuth, 1);
    return new THREE.Vector3(v.x, v.y, v.z);
  }, [sunAltitude, sunAzimuth]);

  // Dynamic atmospheric parameters based on time (sun altitude).
  // Spec: rayleigh=3, turbidity=2 for dark-sky. We bias toward those at night.
  const nightT = clamp01((-sunAltitude - 6) / 18); // 0 at day, ~1 at deep night
  const rayleigh = 1.2 + 1.8 * nightT; // -> ~3.0
  const turbidity = 6.0 - 4.0 * nightT; // -> ~2.0
  const mieCoefficient = 0.005 + 0.002 * (1 - nightT);
  const mieDirectionalG = 0.8;
  
  return (
    <group>

      {/* Panorama environment (inverted sphere) */}
      {showGround && (
        <mesh>
          <sphereGeometry args={[8000, 64, 64]} />
          <meshBasicMaterial map={panoramaTexture} side={THREE.BackSide} />
        </mesh>
      )}

      {/* Preetham sky. Keep it subtle at night so zenith goes near-black. */}
      <Sky
        distance={450000}
        sunPosition={sunDir}
        rayleigh={rayleigh}
        turbidity={turbidity}
        mieCoefficient={mieCoefficient}
        mieDirectionalG={mieDirectionalG}
      />

      {/* Extra dark dome to ensure deep black zenith at night */}
      {sunAltitude < -12 && (
        <mesh>
          <sphereGeometry args={[7990, 32, 32]} />
          <meshBasicMaterial color={'#000000'} side={THREE.BackSide} transparent opacity={0.65 + 0.35 * nightT} />
        </mesh>
      )}
      
      {/* Grid */}
      {showGrid && (
        <gridHelper args={[6000, 24, '#334455', '#223344']} position={[0, -5, 0]} />
      )}
    </group>
  );
}
