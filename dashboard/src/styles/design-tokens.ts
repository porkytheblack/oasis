/**
 * Oasis Dashboard Design Tokens
 *
 * Inspired by hex.tech's sophisticated digital luxury aesthetic
 * Featuring deep jewel tones with rose accents
 *
 * Design Philosophy:
 * - Deep eggplant/amethyst background tones for depth
 * - Soft rose highlights for warmth and emphasis
 * - Jade/teal as secondary accent for success states
 * - High contrast for accessibility (WCAG 2.1 AA compliant)
 */

// =============================================================================
// COLOR PRIMITIVES
// =============================================================================

export const colorPrimitives = {
  // Core brand colors from hex.tech
  black: '#01011b',
  white: '#ffffff',
  roseQuartz: '#F5C0C0',
  eggplant: '#31263B',

  // Extended palette
  amethyst: '#A477B2',
  minsk: '#473982',
  jade: '#5CB198',
  cement: '#717A94',

  // Neutral scale (dark theme optimized)
  neutral: {
    50: '#fafafa',
    100: '#f4f4f5',
    200: '#e4e4e7',
    300: '#d4d4d8',
    400: '#a1a1aa',
    500: '#71717a',
    600: '#52525b',
    700: '#3f3f46',
    800: '#27272a',
    900: '#18181b',
    950: '#09090b',
  },

  // Purple scale (primary)
  purple: {
    50: '#faf5ff',
    100: '#f3e8ff',
    200: '#e9d5ff',
    300: '#d8b4fe',
    400: '#c084fc',
    500: '#a855f7',
    600: '#9333ea',
    700: '#7c3aed',
    800: '#6b21a8',
    900: '#581c87',
    950: '#3b0764',
  },

  // Rose scale (highlight/accent)
  rose: {
    50: '#fff1f2',
    100: '#ffe4e6',
    200: '#fecdd3',
    300: '#fda4af',
    400: '#fb7185',
    500: '#f43f5e',
    600: '#e11d48',
    700: '#be123c',
    800: '#9f1239',
    900: '#881337',
    950: '#4c0519',
  },

  // Teal scale (secondary)
  teal: {
    50: '#f0fdfa',
    100: '#ccfbf1',
    200: '#99f6e4',
    300: '#5eead4',
    400: '#2dd4bf',
    500: '#14b8a6',
    600: '#0d9488',
    700: '#0f766e',
    800: '#115e59',
    900: '#134e4a',
    950: '#042f2e',
  },

  // Amber scale (warning/draft)
  amber: {
    50: '#fffbeb',
    100: '#fef3c7',
    200: '#fde68a',
    300: '#fcd34d',
    400: '#fbbf24',
    500: '#f59e0b',
    600: '#d97706',
    700: '#b45309',
    800: '#92400e',
    900: '#78350f',
    950: '#451a03',
  },

  // Red scale (destructive/error)
  red: {
    50: '#fef2f2',
    100: '#fee2e2',
    200: '#fecaca',
    300: '#fca5a5',
    400: '#f87171',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
    800: '#991b1b',
    900: '#7f1d1d',
    950: '#450a0a',
  },
} as const;

// =============================================================================
// SEMANTIC COLORS - DARK THEME (DEFAULT)
// =============================================================================

export const darkTheme = {
  // Backgrounds - deep eggplant layered for depth
  background: {
    DEFAULT: '#0c0a10',      // Deepest background
    subtle: '#12101a',       // Slightly elevated
    muted: '#1a1724',        // Card backgrounds
    elevated: '#221f2e',     // Elevated surfaces
  },

  // Foreground/text - warm off-whites inspired by rose quartz
  foreground: {
    DEFAULT: '#f5e6e8',      // Primary text
    muted: '#b39da0',        // Secondary text
    subtle: '#7a6668',       // Tertiary/disabled text
  },

  // Primary - deep purple/eggplant with amethyst tint
  primary: {
    DEFAULT: '#473982',      // Minsk purple
    foreground: '#f5e6e8',
    hover: '#5a4a9a',
  },

  // Secondary - jade/teal for positive actions
  secondary: {
    DEFAULT: '#5CB198',      // Jade
    foreground: '#ffffff',
    hover: '#4a9a82',
  },

  // Accent - amethyst for highlights
  accent: {
    DEFAULT: '#A477B2',      // Amethyst
    foreground: '#ffffff',
    hover: '#b88ac4',
  },

  // Highlight - soft rose for emphasis
  highlight: '#F5C0C0',      // Rose quartz

  // Destructive - red for errors/danger
  destructive: {
    DEFAULT: '#dc2626',
    foreground: '#ffffff',
    hover: '#b91c1c',
  },

  // Muted surfaces
  muted: {
    DEFAULT: '#1a1724',
    foreground: '#9a8a8c',
  },

  // Card surfaces
  card: {
    DEFAULT: '#12101a',
    foreground: '#f5e6e8',
  },

  // Borders and inputs
  border: '#2a2538',
  input: '#1a1724',
  ring: '#5a4a9a',

  // Sidebar
  sidebar: {
    DEFAULT: '#09080c',
    foreground: '#d9c9cc',
    accent: '#1f1a2a',
    accentForeground: '#f5e6e8',
    border: '#1a1524',
  },

  // Grid colors (hex.tech inspired)
  grid: {
    200: '#252128',
    300: '#302a35',
    400: '#3b3440',
    500: '#4a4250',
    600: '#5a5260',
    700: '#6a6270',
  },

  // Chart colors
  chart: {
    1: '#A477B2', // Amethyst
    2: '#5CB198', // Jade
    3: '#fbbf24', // Amber
    4: '#38bdf8', // Sky
    5: '#fb7185', // Rose
  },
} as const;

// =============================================================================
// SEMANTIC COLORS - LIGHT THEME
// =============================================================================

export const lightTheme = {
  background: {
    DEFAULT: '#ffffff',
    subtle: '#faf8fc',
    muted: '#f4f2f7',
    elevated: '#ffffff',
  },

  foreground: {
    DEFAULT: '#1a1524',
    muted: '#5a4a5c',
    subtle: '#8a7a8c',
  },

  primary: {
    DEFAULT: '#473982',
    foreground: '#ffffff',
    hover: '#3a2e6b',
  },

  secondary: {
    DEFAULT: '#0d9488',
    foreground: '#ffffff',
    hover: '#0f766e',
  },

  accent: {
    DEFAULT: '#9333ea',
    foreground: '#ffffff',
    hover: '#7c3aed',
  },

  highlight: '#be123c',

  destructive: {
    DEFAULT: '#dc2626',
    foreground: '#ffffff',
    hover: '#b91c1c',
  },

  muted: {
    DEFAULT: '#f4f2f7',
    foreground: '#6a5a6c',
  },

  card: {
    DEFAULT: '#ffffff',
    foreground: '#1a1524',
  },

  border: '#e4e0ea',
  input: '#f4f2f7',
  ring: '#7c3aed',

  sidebar: {
    DEFAULT: '#f8f6fc',
    foreground: '#3a2a3c',
    accent: '#ebe6f4',
    accentForeground: '#1a1524',
    border: '#e4e0ea',
  },

  grid: {
    200: '#f4f2f7',
    300: '#ebe8f0',
    400: '#ddd8e5',
    500: '#ccc6d4',
    600: '#b8b0c2',
    700: '#a49aae',
  },

  chart: {
    1: '#9333ea',
    2: '#0d9488',
    3: '#d97706',
    4: '#0284c7',
    5: '#e11d48',
  },
} as const;

// =============================================================================
// TYPOGRAPHY
// =============================================================================

export const typography = {
  // Font families
  fontFamily: {
    sans: '"Sora", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    mono: '"IBM Plex Mono", "JetBrains Mono", "Fira Code", Monaco, Consolas, monospace',
  },

  // Font sizes with line heights (fluid scaling)
  fontSize: {
    xs: ['0.75rem', { lineHeight: '1rem' }],         // 12px
    sm: ['0.875rem', { lineHeight: '1.25rem' }],     // 14px
    base: ['1rem', { lineHeight: '1.5rem' }],        // 16px
    lg: ['1.125rem', { lineHeight: '1.75rem' }],     // 18px
    xl: ['1.25rem', { lineHeight: '1.75rem' }],      // 20px
    '2xl': ['1.5rem', { lineHeight: '2rem' }],       // 24px
    '3xl': ['1.875rem', { lineHeight: '2.25rem' }],  // 30px
    '4xl': ['2.25rem', { lineHeight: '2.5rem' }],    // 36px
    '5xl': ['3rem', { lineHeight: '1' }],            // 48px
    '6xl': ['3.75rem', { lineHeight: '1' }],         // 60px
  },

  // Font weights
  fontWeight: {
    light: '300',
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
  },

  // Letter spacing
  letterSpacing: {
    tighter: '-0.05em',
    tight: '-0.025em',
    normal: '0em',
    wide: '0.025em',
    wider: '0.05em',
    widest: '0.1em',
  },
} as const;

// =============================================================================
// SPACING (Based on 4px/8px grid)
// =============================================================================

export const spacing = {
  px: '1px',
  0: '0px',
  0.5: '0.125rem',  // 2px
  1: '0.25rem',     // 4px
  1.5: '0.375rem',  // 6px
  2: '0.5rem',      // 8px
  2.5: '0.625rem',  // 10px
  3: '0.75rem',     // 12px
  3.5: '0.875rem',  // 14px
  4: '1rem',        // 16px
  5: '1.25rem',     // 20px
  6: '1.5rem',      // 24px
  7: '1.75rem',     // 28px
  8: '2rem',        // 32px
  9: '2.25rem',     // 36px
  10: '2.5rem',     // 40px
  11: '2.75rem',    // 44px
  12: '3rem',       // 48px
  14: '3.5rem',     // 56px
  16: '4rem',       // 64px
  20: '5rem',       // 80px
  24: '6rem',       // 96px
  28: '7rem',       // 112px
  32: '8rem',       // 128px
} as const;

// =============================================================================
// BORDER RADIUS (hex.tech inspired)
// =============================================================================

export const borderRadius = {
  none: '0px',
  sm: '3px',        // Subtle rounding
  DEFAULT: '6px',   // Default elements
  md: '8px',        // Medium elements
  lg: '12px',       // Cards and containers
  xl: '16px',       // Large containers
  '2xl': '20px',    // Hero sections
  '3xl': '24px',    // Feature cards
  full: '9999px',   // Pills and circular elements
} as const;

// =============================================================================
// SHADOWS (hex.tech layered shadow system)
// =============================================================================

export const shadows = {
  none: 'none',

  // Subtle elevation
  sm: '0px 1px 2px 0px rgba(0, 0, 0, 0.05)',

  // Default shadow
  DEFAULT: '0px 1px 3px 0px rgba(0, 0, 0, 0.1), 0px 1px 2px -1px rgba(0, 0, 0, 0.1)',

  // Medium elevation
  md: '0px 4px 6px -1px rgba(0, 0, 0, 0.1), 0px 2px 4px -2px rgba(0, 0, 0, 0.1)',

  // Large elevation (cards, modals)
  lg: '0px 10px 15px -3px rgba(0, 0, 0, 0.1), 0px 4px 6px -4px rgba(0, 0, 0, 0.1)',

  // Extra large (dropdowns, popovers)
  xl: '0px 20px 25px -5px rgba(0, 0, 0, 0.1), 0px 8px 10px -6px rgba(0, 0, 0, 0.1)',

  // Maximum elevation (dialogs)
  '2xl': '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',

  // Hex.tech inspired glow shadows
  glow: {
    purple: '0 0 20px rgba(164, 119, 178, 0.3)',
    rose: '0 0 20px rgba(245, 192, 192, 0.3)',
    jade: '0 0 20px rgba(92, 177, 152, 0.3)',
  },

  // Inset shadow for depth
  inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)',

  // Card shadow with subtle glow
  card: '0 0 24px 0px rgba(37, 33, 40, 0.5) inset, 0px 2px 8px -2px rgba(0, 0, 0, 0.3)',
} as const;

// =============================================================================
// ANIMATIONS & TRANSITIONS
// =============================================================================

export const animation = {
  // Durations
  duration: {
    fast: '150ms',
    DEFAULT: '200ms',
    slow: '300ms',
    slower: '500ms',
  },

  // Timing functions (hex.tech uses spring-like easing)
  easing: {
    DEFAULT: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    out: 'cubic-bezier(0, 0, 0.2, 1)',
    inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',  // Bouncy spring
  },

  // Pre-defined transitions
  transition: {
    none: 'none',
    all: 'all 200ms cubic-bezier(0.25, 0.1, 0.25, 1)',
    colors: 'color, background-color, border-color, text-decoration-color, fill, stroke 200ms cubic-bezier(0.25, 0.1, 0.25, 1)',
    opacity: 'opacity 200ms cubic-bezier(0.25, 0.1, 0.25, 1)',
    shadow: 'box-shadow 200ms cubic-bezier(0.25, 0.1, 0.25, 1)',
    transform: 'transform 200ms cubic-bezier(0.25, 0.1, 0.25, 1)',
  },
} as const;

// =============================================================================
// BREAKPOINTS (Mobile-first)
// =============================================================================

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

// =============================================================================
// Z-INDEX SCALE
// =============================================================================

export const zIndex = {
  hide: -1,
  base: 0,
  dropdown: 10,
  sticky: 20,
  fixed: 30,
  modalBackdrop: 40,
  modal: 50,
  popover: 60,
  tooltip: 70,
  toast: 80,
} as const;

// =============================================================================
// EXPORT ALL TOKENS
// =============================================================================

export const tokens = {
  colors: colorPrimitives,
  dark: darkTheme,
  light: lightTheme,
  typography,
  spacing,
  borderRadius,
  shadows,
  animation,
  breakpoints,
  zIndex,
} as const;

export default tokens;
