import React from 'react';

type VyralIdentityIconProps = {
  size?: number;
  className?: string;
};

/**
 * Minimal Vyral identity mark.
 * The three geometric strokes form a distinctive V, with a small floating
 * diamond representing the identity shared across a creative universe.
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
      d="M4.5 7.5h6.1L16 21.2l5.4-13.7h6.1L19 26.1a3.25 3.25 0 0 1-6 0L4.5 7.5Z"
      fill="currentColor"
    />
    <path
      d="m16 2.5 3.1 3.1L16 8.7l-3.1-3.1L16 2.5Z"
      fill="currentColor"
      opacity="0.72"
    />
  </svg>
);
