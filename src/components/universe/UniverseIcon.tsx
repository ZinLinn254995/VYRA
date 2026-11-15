import React from 'react';

type UniverseIconProps = React.SVGProps<SVGSVGElement> & {
  size?: number;
};

/**
 * A modular abstract mark for a Universe: four independent creative parts
 * gather around one shared core, while the open corners imply room to grow.
 */
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
      <path
        d="M9 3.75H6.25A2.5 2.5 0 0 0 3.75 6.25V9"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15 3.75H17.75A2.5 2.5 0 0 1 20.25 6.25V9"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20.25 15V17.75A2.5 2.5 0 0 1 17.75 20.25H15"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 20.25H6.25A2.5 2.5 0 0 1 3.75 17.75V15"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 8.25L15.75 12L12 15.75L8.25 12L12 8.25Z"
        fill="currentColor"
      />
    </svg>
  );
}
