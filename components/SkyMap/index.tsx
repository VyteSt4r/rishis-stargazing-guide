'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { Suspense, useState, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { StarField } from './StarField';
import { CelestialSphere } from './CelestialSphere';
import { Planets } from './Planets';
import { ConstellationLines } from './ConstellationLines';
import { CompassLabels } from './CompassLabels';
import { loadFullStarCatalog, StarRecord } from '@/lib/starCatalog';
import {
  BANGALORE_LOCATION,
  equatorialToHorizontal,
  getPlanetPositions,
  getSunPosition,
  getAtmosphericColor,
  ObserverLocation,
  CelestialBody
} from '@/lib/astronomyUtils';

interface SkyMapProps {
  location?: ObserverLocation;
  bortleScale?: number;
  showGrid?: boolean;
  showGround?: boolean;
  showPlanets?: boolean;
  className?: string;
}

export function SkyMap({
  location = BANGALORE_LOCATION,
  bortleScale = 4,
  showGrid = true,
  showGround = true,
  showPlanets = true,
  className = ''
}: SkyMapProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [stars, setStars] = useState<StarRecord[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timeSpeed, setTimeSpeed] = useState(1);
  
  // Load star catalog
  useEffect(() => {
    loadFullStarCatalog(6.5).then(setStars);
  }, []);
  
  // Time animation
  useEffect(() => {
    if (!isPlaying) return;
    
    const interval = setInterval(() => {
      setCurrentTime(prev => new Date(prev.getTime() + timeSpeed * 1000));
    }, 100);
    
    return () => clearInterval(interval);
  }, [isPlaying, timeSpeed]);
  
  // Calculate star positions
  const starPositions = useMemo(() => {
    return stars.map(star => {
      const hor = equatorialToHorizontal({ ra: star.ra, dec: star.dec }, location, currentTime);
      return {
        altitude: hor.altitude,
        azimuth: hor.azimuth,
        visible: hor.altitude > 0
      };
    });
  }, [stars, location, currentTime]);
  
  // Get sun position and atmospheric color
  const sunPosition = useMemo(() => getSunPosition(currentTime, location), [currentTime, location]);
  const atmosphericColor = useMemo(() => getAtmosphericColor(sunPosition.altitude), [sunPosition.altitude]);
  
  // Get planet positions
  const planets = useMemo(() => {
    if (!showPlanets) return [];
    return getPlanetPositions(currentTime, location);
  }, [currentTime, location, showPlanets]);
  
  return (
    <div className={`relative w-full h-full ${className}`}>
      {/* Three.js Canvas - Sky View */}
      <Canvas
        gl={{ 
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance'
        }}
        dpr={[1, 2]}
        onCreated={({ gl }) => {
          // Cinematic tone mapping to avoid star burn-out.
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
          gl.outputColorSpace = THREE.SRGBColorSpace;
        }}
      >
        <PerspectiveCamera makeDefault position={[0, 0, 0]} fov={90} near={0.1} far={20000} />
        <OrbitControls 
          target={[0, 500, 0]}
          enablePan={false}
          minPolarAngle={0}
          maxPolarAngle={Math.PI}
          enableDamping={true}
          dampingFactor={0.05}
        />
        
        <Suspense fallback={null}>
          <CelestialSphere
            showGround={showGround}
            showGrid={showGrid}
            atmosphericColor={atmosphericColor}
            sunAltitude={sunPosition.altitude}
            sunAzimuth={sunPosition.azimuth}
          />

          {/* Horizon compass labels via CSS2DRenderer */}
          {showGround && <CompassLabels radius={1600} />}
          
          <StarField
            stars={stars}
            starPositions={starPositions}
            bortleScale={bortleScale}
            sunAltitude={sunPosition.altitude}
          />
          
          <ConstellationLines
            stars={stars}
            starPositions={starPositions}
            sunAltitude={sunPosition.altitude}
          />
          
          {showPlanets && <Planets planets={planets} />}
        </Suspense>
        
        {/* Unreal Bloom Post-Processing */}
        <EffectComposer>
          <Bloom
            intensity={1.8}
            luminanceThreshold={0.9}
            luminanceSmoothing={0.25}
            mipmapBlur={true}
          />
        </EffectComposer>
      </Canvas>
      
      {/* Glassmorphic HUD */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-10">
        <div className="backdrop-blur-xl bg-black/40 border border-[#00F0FF]/30 rounded-2xl p-4 shadow-2xl">
          <div className="flex items-center gap-6">
            {/* Time Display */}
            <div className="text-center">
              <div className="font-mono text-xl font-bold text-[#00F0FF]" suppressHydrationWarning>
                {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
              </div>
              <div className="text-xs text-white/70" suppressHydrationWarning>
                {currentTime.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
              </div>
            </div>
            
            {/* Controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="p-2 rounded-lg bg-[#00F0FF]/20 hover:bg-[#00F0FF]/30 transition-colors"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <svg className="w-5 h-5 text-[#00F0FF]" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="4" width="4" height="16" rx="1"/>
                    <rect x="14" y="4" width="4" height="16" rx="1"/>
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-[#00F0FF]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                )}
              </button>
              
              <button
                onClick={() => setCurrentTime(new Date())}
                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-[#00F0FF]/20 hover:bg-[#00F0FF]/30 text-[#00F0FF] transition-colors"
              >
                Now
              </button>
            </div>
            
            {/* Speed Control */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/70">Speed:</span>
              <select
                value={timeSpeed}
                onChange={(e) => setTimeSpeed(Number(e.target.value))}
                className="bg-black/50 text-[#00F0FF] border border-[#00F0FF]/30 rounded px-2 py-1 text-sm"
              >
                <option value={1}>1×</option>
                <option value={60}>1m</option>
                <option value={3600}>1h</option>
                <option value={86400}>1d</option>
              </select>
            </div>
            
            {/* Stats */}
            <div className="text-xs text-white/70 border-l border-white/20 pl-4">
              <div>{stars.filter((_, i) => starPositions[i]?.visible).length} stars visible</div>
              <div>Bortle: {bortleScale}</div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Info Panel */}
      <div className="absolute top-6 right-6 backdrop-blur-xl bg-black/40 border border-[#00F0FF]/30 rounded-2xl p-4 shadow-2xl max-w-xs">
        <h3 className="text-[#00F0FF] font-bold text-lg mb-2">Zenith Archive</h3>
        <div className="text-white/80 text-sm space-y-1">
          <div className="flex justify-between">
            <span>Location:</span>
            <span className="text-[#00F0FF]">Bangalore</span>
          </div>
          <div className="flex justify-between">
            <span>Sun Alt:</span>
            <span className="text-[#00F0FF]">{sunPosition.altitude.toFixed(1)}°</span>
          </div>
          <div className="flex justify-between">
            <span>Planets:</span>
            <span className="text-[#00F0FF]">{planets.length} visible</span>
          </div>
        </div>
      </div>
    </div>
  );
}
