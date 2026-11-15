/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Centralized Brand Configuration
 *
 * Keep the brand identity and visual tokens centralized. Product navigation,
 * provider configuration, and social-channel connection state belong to their
 * own domain systems rather than this visual brand configuration.
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
  id: 'vyra-creative-platform',
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
