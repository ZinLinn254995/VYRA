import React from 'react';

type UniverseIconProps = React.SVGProps<SVGSVGElement> & {
  size?: number;
};

/** A minimal orbit-and-core mark representing one connected creative Universe. */
export function UniverseIcon({ size = 24, ...props }: UniverseIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <ellipse
        cx="12"
        cy="12"
        rx="9.1"
        ry="4.65"
        transform="rotate(-38 12 12)"
        stroke="currentColor"
        strokeWidth="1.55"
      />
      <circle cx="12" cy="12" r="3.05" fill="currentColor" />
      <circle cx="4.85" cy="7.1" r="1.55" fill="currentColor" />
      <circle cx="19.1" cy="16.55" r="1.35" fill="currentColor" />
    </svg>
  );
}
