'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { horizontalToCartesian } from '@/lib/astronomyUtils';
import constellationLines from '@/data/celestial/constellations.lines.json';

interface Star {
  ra: number;
  dec: number;
  mag: number;
  bv: number;
  properName?: string;
  hip?: number;
}

interface ConstellationLinesProps {
  stars: Star[];
  starPositions: Array<{ altitude: number; azimuth: number; visible: boolean }>;
  sunAltitude: number;
}

export function ConstellationLines({ stars, starPositions, sunAltitude }: ConstellationLinesProps) {
  const lineGeometry = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const isDaytime = sunAltitude > -6;
    
    // Only show constellations at night or twilight
    if (sunAltitude > 5) return null;
    
    // Parse constellation lines from GeoJSON
    const features = (constellationLines as any).features;
    
    features.forEach((feature: any) => {
      if (feature.geometry.type !== 'LineString') return;
      
      const coordinates = feature.geometry.coordinates;
      
      // Each line segment
      for (let i = 0; i < coordinates.length - 1; i++) {
        const [ra1, dec1] = coordinates[i];
        const [ra2, dec2] = coordinates[i + 1];
        
        // Find matching stars by RA/Dec (approximate matching)
        const star1 = stars.find(s => Math.abs(s.ra - ra1) < 0.1 && Math.abs(s.dec - dec1) < 0.1);
        const star2 = stars.find(s => Math.abs(s.ra - ra2) < 0.1 && Math.abs(s.dec - dec2) < 0.1);
        
        if (star1 && star2) {
          const idx1 = stars.indexOf(star1);
          const idx2 = stars.indexOf(star2);
          
          const pos1 = starPositions[idx1];
          const pos2 = starPositions[idx2];
          
          // Only draw if both stars are above horizon
          if (pos1?.visible && pos2?.visible && pos1.altitude > 0 && pos2.altitude > 0) {
            const cart1 = horizontalToCartesian(pos1.altitude, pos1.azimuth, 990);
            const cart2 = horizontalToCartesian(pos2.altitude, pos2.azimuth, 990);
            
            points.push(
              new THREE.Vector3(cart1.x, cart1.y, cart1.z),
              new THREE.Vector3(cart2.x, cart2.y, cart2.z)
            );
          }
        }
      }
    });
    
    if (points.length === 0) return null;
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    return geometry;
  }, [stars, starPositions, sunAltitude]);
  
  if (!lineGeometry) return null;
  
  // Fade lines based on sun altitude
  const opacity = sunAltitude > 0 ? 0.1 : Math.min(0.5, 0.5 * (1 + sunAltitude / 18));
  
  return (
    <lineSegments geometry={lineGeometry}>
      <lineBasicMaterial 
        color="#00F0FF" 
        transparent 
        opacity={opacity}
        blending={THREE.AdditiveBlending}
      />
    </lineSegments>
  );
}
