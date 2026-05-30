"use client";

import React from "react";

interface AuthLayoutShellProps {
  children: React.ReactNode;
}

export const AuthLayoutShell: React.FC<AuthLayoutShellProps> = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-white dark:bg-black py-12 px-4 transition-colors duration-300">
      {/* Typrographic Logo "Y" */}
      <div className="flex flex-col items-center select-none mb-4 group cursor-default">
        <h1 className="text-8xl font-black tracking-tighter text-zinc-950 dark:text-zinc-50 transition-all duration-500 group-hover:scale-105 group-hover:rotate-1 drop-shadow-[0_2px_10px_rgba(0,0,0,0.05)] dark:drop-shadow-[0_2px_15px_rgba(255,255,255,0.1)]">
          Y
        </h1>
      </div>

      {/* Forms Card Wrapper */}
      <div className="w-full max-w-md px-6 flex flex-col gap-6">
        {children}
      </div>
    </div>
  );
};
