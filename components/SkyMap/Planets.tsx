'use client';

import { useMemo } from 'react';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { CelestialBody } from '@/lib/astronomyUtils';

interface PlanetsProps {
  planets: CelestialBody[];
}

export function Planets({ planets }: PlanetsProps) {
  return (
    <group>
      {planets.map((planet) => {
        // Smaller planets - stars should be the focus
        const baseSize = planet.name === 'Jupiter' ? 25 : planet.name === 'Saturn' ? 22 : 18;
        const size = baseSize * (planet.magnitude < 0 ? 1.3 : 1.0);
        
        return (
          <group key={planet.name} position={[planet.position.x, planet.position.y, planet.position.z]}>
            {/* Outer glow */}
            <mesh>
              <sphereGeometry args={[size * 4, 32, 32]} />
              <meshBasicMaterial
                color={planet.color}
                transparent
                opacity={0.1}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
            
            {/* Mid glow */}
            <mesh>
              <sphereGeometry args={[size * 2, 32, 32]} />
              <meshBasicMaterial
                color={planet.color}
                transparent
                opacity={0.4}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
            
            {/* Planet sphere */}
            <mesh>
              <sphereGeometry args={[size, 32, 32]} />
              <meshBasicMaterial 
                color={planet.color}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
            
            {/* Label removed temporarily - was causing font error */}
          </group>
        );
      })}
    </group>
  );
}
