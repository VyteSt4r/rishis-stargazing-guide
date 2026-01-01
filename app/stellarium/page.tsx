'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function StellariumPage() {
  const [loading, setLoading] = useState(true);
  
  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      {/* Navigation */}
      <div className="absolute top-4 left-4 z-20">
        <Link 
          href="/"
          className="px-4 py-2 bg-black/80 hover:bg-black text-white rounded-lg backdrop-blur-sm transition-colors border border-cyan-500/30"
        >
          ← Back to Home
        </Link>
      </div>
      
      {/* Loading indicator */}
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-cyan-400 mb-4"></div>
            <p className="text-cyan-400 text-xl font-bold">Loading Stellarium Engine...</p>
            <p className="text-white/60 text-sm mt-2">1+ billion stars loading...</p>
          </div>
        </div>
      )}
      
      {/* Stellarium Web iframe - Official Engine */}
      <iframe
        src="https://stellarium-web.org/"
        className="w-full h-full border-none"
        title="Stellarium Web"
        allow="geolocation; fullscreen"
        onLoad={() => setLoading(false)}
        style={{ 
          display: 'block',
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          border: 'none'
        }}
      />
    </div>
  );
}
