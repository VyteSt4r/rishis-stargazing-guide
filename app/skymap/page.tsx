'use client';

import dynamic from 'next/dynamic';

// Dynamic import to avoid SSR issues with Three.js
const SkyMap = dynamic(
  () => import('@/components/SkyMap').then(mod => ({ default: mod.SkyMap })),
  { ssr: false, loading: () => (
    <div className="flex items-center justify-center w-full h-screen bg-black">
      <div className="text-[#00F0FF] text-xl">Loading Zenith Archive...</div>
    </div>
  )}
);

export default function SkyMapPage() {
  return (
    <div className="w-full h-screen bg-black overflow-hidden">
      <SkyMap 
        bortleScale={4}
        showGrid={true}
        showGround={true}
        showPlanets={true}
        className="w-full h-full"
      />
    </div>
  );
}
