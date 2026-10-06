'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { usePathname } from 'next/navigation';

interface SplashLoaderProps {
  /** If provided, manually controls visibility */
  isLoading?: boolean;
  /** Custom status message below video */
  message?: string;
  /** Whether to show as route transition screen automatically */
  enableRouteTransitions?: boolean;
}

export function SplashLoader({
  isLoading,
  message = 'Initializing Quantro Engine...',
  enableRouteTransitions = false,
}: SplashLoaderProps) {
  const pathname = usePathname();
  const [visible, setVisible] = useState(true);
  const [mounting, setMounting] = useState(true);
  const isInitialMount = useRef(true);
  const prevPathname = useRef(pathname);

  // Initial mount splash — display on first app load then fade out
  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => {
        setMounting(false);
        isInitialMount.current = false;
      }, 400);
    }, 1200);

    return () => clearTimeout(timer);
  }, []);

  // Route change splash transition (only when pathname actually changes)
  useEffect(() => {
    if (!enableRouteTransitions || isInitialMount.current) return;
    if (prevPathname.current === pathname) return;

    prevPathname.current = pathname;
    setMounting(true);
    setVisible(true);

    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => setMounting(false), 400);
    }, 800);

    return () => clearTimeout(timer);
  }, [pathname, enableRouteTransitions]);

  // If manual isLoading control is passed
  const isCurrentlyActive = isLoading !== undefined ? isLoading : visible;

  if (!mounting && !isCurrentlyActive) return null;

  return (
    <div
      aria-hidden="true"
      className={cn(
        'fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#060D1A]/95 backdrop-blur-xl transition-opacity duration-500 ease-in-out',
        isCurrentlyActive ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      )}
    >
      {/* Background ambient glow */}
      <div className="absolute h-96 w-96 rounded-full bg-apex-accent/15 blur-[120px] pointer-events-none" />

      {/* Main Video Loader Card */}
      <div className="relative flex flex-col items-center gap-6 p-6 rounded-3xl border border-apex-border/60 bg-apex-surface/80 shadow-2xl shadow-black/80 max-w-sm w-full mx-4 backdrop-blur-md">
        
        {/* Quantro Brand Badge (Q icon + text) */}
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-apex-border bg-apex-surface/90 text-[10px] uppercase font-semibold tracking-widest text-apex-text shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/quantro_logo.jpeg" alt="Quantro Logo" className="h-4 w-4 rounded-md object-cover" />
          <span>Quantro Software Labs • Apex</span>
        </div>

        {/* Video Frame */}
        <div className="relative w-48 h-48 rounded-2xl overflow-hidden border border-apex-accent/30 shadow-lg shadow-apex-accent/20 bg-black">
          <video
            src="/splash.mp4"
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover scale-105"
          />
          {/* Subtle inner shadow ring */}
          <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-2xl pointer-events-none" />
        </div>

        {/* Loading Message & Spinner */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-apex-accent animate-ping" />
            <p className="text-sm font-semibold text-apex-text tracking-wide">{message}</p>
          </div>
          <p className="text-[11px] text-apex-muted">QuantroApex Continuous Market Engine</p>
        </div>
      </div>
    </div>
  );
}
