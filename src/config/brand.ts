/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Centralized Brand Configuration
 *
 * NOTE: "VYRA" is a provisional project name pending trademark and domain clearance.
 * Keep this configuration isolated so brand assets, names, taglines, and social
 * channels can be swapped across the entire application in seconds without code rewrites.
 */

export interface BrandConfig {
  id: string;
  name: string;
  tagline: string;
  colors: {
    dark: {
      bgMidnight: string;
      surfaceDeepSpace: string;
      accentCyan: string;
      accentViolet: string;
      accentMagenta: string;
    };
    light: {
      bgBase: string;
      surfaceWhite: string;
      accentCyan: string;
      accentViolet: string;
      accentMagenta: string;
    };
  };
}

export const BRAND_CONFIG: BrandConfig = {
  id: 'vyra-studio',
  name: 'VYRA',
  tagline: 'Create beyond imagination.',
  colors: {
    dark: {
      bgMidnight: '#090B18',
      surfaceDeepSpace: '#171A35',
      accentCyan: '#55F4FF',
      accentViolet: '#8D7CFF',
      accentMagenta: '#E36CFF',
    },
    light: {
      bgBase: '#F8FAFC',
      surfaceWhite: '#FFFFFF',
      accentCyan: '#0284C7',
      accentViolet: '#6366F1',
      accentMagenta: '#C026D3',
    },
  },
};
