'use client';

import { useState } from 'react';
import SkyViewer from '@/components/SkyViewer';
import Link from 'next/link';

export default function StargazingPage() {
  const [showLines, setShowLines] = useState(true);
  const [showLabels, setShowLabels] = useState(true);

  return (
    <div className="relative w-full h-screen bg-black">
      {/* Header with back button */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/80 to-transparent p-4">
        <div className="flex items-center max-w-7xl mx-auto">
          <Link 
            href="/"
            className="flex items-center gap-2 text-white hover:text-blue-400 transition-colors"
          >
            <svg 
              className="w-6 h-6" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M10 19l-7-7m0 0l7-7m-7 7h18" 
              />
            </svg>
            <span className="text-lg font-semibold">Back to Dashboard</span>
          </Link>
        </div>
      </div>

      {/* Full-screen sky viewer */}
      <SkyViewer 
        showConstellationLines={showLines}
        showConstellationLabels={showLabels}
      />
    </div>
  );
}
