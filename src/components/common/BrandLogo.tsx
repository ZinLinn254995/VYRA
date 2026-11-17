/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BRAND_CONFIG } from '../../config/brand';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showWordmark?: boolean;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  showWordmark = true,
  className = '',
}) => {
  const iconDimensions = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-11 h-11',
    xl: 'w-14 h-14',
  }[size];

  const textSizes = {
    sm: 'text-base font-bold tracking-wider',
    md: 'text-xl font-extrabold tracking-wider',
    lg: 'text-2xl font-extrabold tracking-wider',
    xl: 'text-3xl font-extrabold tracking-wider',
  }[size];

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* Geometric V-inspired Mark */}
      <div className={`relative ${iconDimensions} shrink-0 flex items-center justify-center`}>
        <svg
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-sm"
          aria-hidden="true"
        >
          {/* Subtle dark backdrop hexagon / shield contour */}
          <rect width="48" height="48" rx="12" className="fill-[#090B18] dark:fill-[#171A35]" />

          {/* Left Wing - Deep Violet to Cyan Gradient */}
          <path
            d="M11 12L24 38L20 38L7 12H11Z"
            fill="url(#vyra-gradient-left)"
          />

          {/* Right Wing - Neon Cyan Gradient */}
          <path
            d="M37 12L24 38L28 38L41 12H37Z"
            fill="url(#vyra-gradient-right)"
          />

          {/* Core Apex Prism Lens */}
          <path
            d="M24 16L30 28H18L24 16Z"
            fill="url(#vyra-apex-glow)"
            opacity="0.85"
          />

          {/* Precision Center Beacon Dot */}
          <circle cx="24" cy="35" r="1.75" fill="#55F4FF" />

          <defs>
            <linearGradient id="vyra-gradient-left" x1="7" y1="12" x2="24" y2="38" gradientUnits="userSpaceOnUse">
              <stop stopColor="#8D7CFF" />
              <stop offset="1" stopColor="#55F4FF" />
            </linearGradient>
            <linearGradient id="vyra-gradient-right" x1="41" y1="12" x2="24" y2="38" gradientUnits="userSpaceOnUse">
              <stop stopColor="#55F4FF" />
              <stop offset="0.6" stopColor="#8D7CFF" />
              <stop offset="1" stopColor="#E36CFF" />
            </linearGradient>
            <linearGradient id="vyra-apex-glow" x1="24" y1="16" x2="24" y2="28" gradientUnits="userSpaceOnUse">
              <stop stopColor="#55F4FF" stopOpacity="0.9" />
              <stop offset="1" stopColor="#8D7CFF" stopOpacity="0.2" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {showWordmark && (
        <div className="flex min-w-0 flex-col">
          <div className="flex min-w-0 items-center gap-1.5">
            <span
              className={`${textSizes} min-w-0 truncate font-black tracking-widest text-slate-900 dark:text-white transition-colors`}
            >
              {BRAND_CONFIG.name}
            </span>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-[#1E2345] text-slate-600 dark:text-[#55F4FF] tracking-wider font-semibold">
              Studio
            </span>
          </div>
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 -mt-0.5 tracking-tight truncate max-w-[170px]">
            {BRAND_CONFIG.tagline}
          </span>
        </div>
      )}
    </div>
  );
};
