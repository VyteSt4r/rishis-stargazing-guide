'use client';

import { useState } from 'react';

export default function StellariumSkyPage() {
  const [loading, setLoading] = useState(true);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-cyan-400 mb-4" />
            <p className="text-cyan-400 text-xl font-bold">Loading Stellarium…</p>
            <p className="text-white/60 text-sm mt-2">Live sky view via Stellarium Web</p>
          </div>
        </div>
      )}

      <iframe
        src="https://stellarium-web.org/"
        className="w-full h-full border-none"
        title="Stellarium Web"
        allow="geolocation; fullscreen"
        onLoad={() => setLoading(false)}
        style={{ display: 'block', position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
      />
    </div>
  );
}
