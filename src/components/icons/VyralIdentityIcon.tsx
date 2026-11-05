import React from 'react';

type VyralIdentityIconProps = {
  size?: number;
  className?: string;
};

/**
 * VYRA's abstract geometric Vyral Identity mark.
 * Four distinct facets represent the Vyral's connected creative assets;
 * their shared negative space protects the identity at the center.
 */
export const VyralIdentityIcon: React.FC<VyralIdentityIconProps> = ({
  size = 20,
  className,
}) => (
  <svg
    aria-hidden="true"
    focusable="false"
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    className={className}
  >
    <path
      d="M15.15 2.8 5.15 8.55 11.45 12.2 16 9.55 20.55 12.2 26.85 8.55 16.85 2.8a1.7 1.7 0 0 0-1.7 0Z"
      fill="currentColor"
    />
    <path
      d="m4.7 9.35 6.15 3.55v7.1L4.7 23.55V9.35Z"
      fill="currentColor"
      opacity="0.76"
    />
    <path
      d="m27.3 9.35-6.15 3.55v7.1l6.15 3.55V9.35Z"
      fill="currentColor"
      opacity="0.9"
    />
    <path
      d="m5.55 24.55 6.15-3.55L16 23.65l4.3-2.65 6.15 3.55-9.6 5.55a1.7 1.7 0 0 1-1.7 0l-9.6-5.55Z"
      fill="currentColor"
      opacity="0.62"
    />
    <path
      d="m16 11.1 4.1 2.4v5L16 20.9l-4.1-2.4v-5l4.1-2.4Z"
      fill="currentColor"
    />
  </svg>
);
