'use client';

import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    StelWebEngine: any;
  }
}

function StellariumEngine() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [engine, setEngine] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stel: any = null;
    let scriptElement: HTMLScriptElement | null = null;

    async function initStellarium() {
      try {
        // Fetch WASM binary first
        const wasmResponse = await fetch('/stellarium/stellarium-web-engine.wasm');
        if (!wasmResponse.ok) {
          throw new Error('Failed to fetch WASM file');
        }
        const wasmBinary = await wasmResponse.arrayBuffer();

        // Load the Stellarium Web Engine script
        scriptElement = document.createElement('script');
        scriptElement.src = '/stellarium/stellarium-web-engine.js';
        scriptElement.async = true;
        
        scriptElement.onload = async () => {
          try {
            if (!window.StelWebEngine) {
              throw new Error('StelWebEngine not found');
            }

            // Create engine instance with pre-loaded WASM
            stel = await window.StelWebEngine({
              wasmBinary: wasmBinary,
              canvas: canvasRef.current,
            });

            console.log('Stellarium engine loaded successfully');
            
            // Set observer location (Bangalore) - check if observer exists
            if (stel.observer) {
              stel.observer.latitude = 12.9716 * Math.PI / 180;
              stel.observer.longitude = 77.5946 * Math.PI / 180;
              stel.observer.elevation = 920;
            } else if (stel.core && stel.core.observer) {
              stel.core.observer.latitude = 12.9716 * Math.PI / 180;
              stel.core.observer.longitude = 77.5946 * Math.PI / 180;
              stel.core.observer.elevation = 920;
            }

            setEngine(stel);
            setLoading(false);

            // Start render loop
            function render() {
              if (stel && canvasRef.current) {
                const w = canvasRef.current.width;
                const h = canvasRef.current.height;
                stel.render(0, 0, w, h);
              }
              requestAnimationFrame(render);
            }
            render();
          } catch (err: any) {
            console.error('Failed to initialize Stellarium:', err);
            setError(err.message);
            setLoading(false);
          }
        };

        scriptElement.onerror = () => {
          setError('Failed to load Stellarium engine script');
          setLoading(false);
        };

        document.body.appendChild(scriptElement);

      } catch (err: any) {
        console.error('Failed to load Stellarium engine:', err);
        setError(err.message);
        setLoading(false);
      }
    }

    initStellarium();

    return () => {
      if (scriptElement && scriptElement.parentNode) {
        scriptElement.parentNode.removeChild(scriptElement);
      }
      if (stel) {
        // Cleanup if needed
      }
    };
  }, []);

  const handleZoom = (delta: number) => {
    if (engine) {
      engine.core.fov *= (1 + delta * 0.1);
    }
  };

  return (
    <div className="relative w-full h-full bg-black">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        width={1920}
        height={1080}
      />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-cyan-400 font-mono">Loading Stellarium Engine...</p>
            <p className="text-gray-500 text-sm mt-2">1.69 billion stars loading...</p>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-6 max-w-md">
            <h3 className="text-red-400 font-bold mb-2">Engine Load Error</h3>
            <p className="text-gray-300 text-sm">{error}</p>
          </div>
        </div>
      )}

      {!loading && !error && (
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2">
          <div className="backdrop-blur-xl bg-black/40 border border-cyan-500/30 rounded-2xl p-4 shadow-2xl">
            <div className="flex items-center gap-4">
              <button
                onClick={() => handleZoom(-1)}
                className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 rounded-lg text-cyan-400 transition-colors"
              >
                Zoom Out
              </button>
              <div className="text-cyan-400 font-mono text-sm">
                Stellarium Web Engine
              </div>
              <button
                onClick={() => handleZoom(1)}
                className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 rounded-lg text-cyan-400 transition-colors"
              >
                Zoom In
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StellariumEngine;
