import React from 'react';

type VyralIdentityIconProps = {
  size?: number;
  className?: string;
};

/**
 * VYRA's original Vyral Identity mark.
 * The outer V represents the Vyral identity; the intertwined inner strands
 * represent its connected assets, with the center diamond as its unique core.
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
      d="M5.5 5.5 13.35 25.1c1.02 2.55 4.28 2.55 5.3 0L26.5 5.5"
      stroke="currentColor"
      strokeWidth="2.35"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M9.2 7.2c0 5.05 13.6 12.55 13.6 17.6M22.8 7.2c0 5.05-13.6 12.55-13.6 17.6"
      stroke="currentColor"
      strokeWidth="1.55"
      strokeLinecap="round"
      opacity="0.68"
    />
    <path
      d="m16 12.35 3.65 3.65L16 19.65 12.35 16 16 12.35Z"
      fill="currentColor"
    />
    <circle cx="9.2" cy="7.2" r="1.35" fill="currentColor" />
    <circle cx="22.8" cy="7.2" r="1.35" fill="currentColor" />
  </svg>
);
