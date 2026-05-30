"use client";

import React from "react";

interface AuthLayoutShellProps {
  children: React.ReactNode;
}

export const AuthLayoutShell: React.FC<AuthLayoutShellProps> = ({ children }) => {
  return (
    <div className="w-full min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-white dark:bg-black transition-colors duration-300">
      {/* Left Column: Interactive Form Panel */}
      <div className="flex flex-col items-center justify-center py-12 px-6 sm:px-12 w-full h-full min-h-screen">
        <div className="w-full max-w-md flex flex-col gap-6">
          {/* Logo "Y" (rescaled for balance in split view) */}
          <div className="flex flex-col items-center lg:items-start select-none group cursor-default">
            <h1 className="text-5xl font-black tracking-tighter text-zinc-950 dark:text-zinc-50 transition-all duration-500 group-hover:scale-105 group-hover:rotate-1 drop-shadow-[0_2px_10px_rgba(0,0,0,0.05)] dark:drop-shadow-[0_2px_15px_rgba(255,255,255,0.1)] mb-2">
              Y
            </h1>
          </div>

          {/* Render Active Forms */}
          {children}
        </div>
      </div>

      {/* Right Column: Premium Ambient Brand Video Wrapper */}
      <div className="hidden lg:block relative w-full h-full bg-zinc-100 dark:bg-zinc-950 overflow-hidden">
        {/* High-end ambient visual overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-tr from-black/30 via-transparent to-black/10 z-10 pointer-events-none" />
        
        <video
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover select-none pointer-events-none"
        >
          <source src="/assets/auth/intro-genz.mp4" type="video/mp4" />
          Your browser does not support the video tag.
        </video>
      </div>
    </div>
  );
};
