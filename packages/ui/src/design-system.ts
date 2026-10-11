/* Import design system CSS variables */
import '../design-system/design-system.css';

/* Export design tokens mapped to six-ink CSS variables */
export const designTokens = {
  colors: {
    // Six-ink semantic aliases
    primary: 'var(--process)',
    primaryHover: 'var(--process-ink)',
    primaryActive: 'var(--process-ink)',
    primaryForeground: 'var(--paper)',

    secondary: 'var(--muted)',
    secondaryHover: 'var(--ink-soft)',
    secondaryForeground: 'var(--toner)',

    destructive: 'var(--register)',
    destructiveHover: 'var(--register)',
    destructiveForeground: 'var(--paper)',

    muted: 'var(--muted)',
    mutedForeground: 'var(--muted)',

    accent: 'var(--highlight)',
    accentForeground: 'var(--toner)',

    background: 'var(--sheet)',
    foreground: 'var(--toner)',

    card: 'var(--paper)',
    cardForeground: 'var(--toner)',

    border: 'var(--hairline)',
    input: 'var(--hairline)',
    ring: 'var(--process)',

    success: 'var(--pass)',
    warning: 'var(--ochre)',
    error: 'var(--register)',
    info: 'var(--process)',

    // Brand scale = process blues
    brand: {
      50: 'var(--brand-50)',
      100: 'var(--brand-100)',
      200: 'var(--brand-200)',
      300: 'var(--brand-300)',
      400: 'var(--brand-400)',
      500: 'var(--brand-500)',
      600: 'var(--brand-600)',
      700: 'var(--brand-700)',
      800: 'var(--brand-800)',
      900: 'var(--brand-900)',
      950: 'var(--brand-950)',
    },

    // Neutral scale = toner/grays
    neutral: {
      0: 'var(--neutral-0)',
      50: 'var(--neutral-50)',
      100: 'var(--neutral-100)',
      200: 'var(--neutral-200)',
      300: 'var(--neutral-300)',
      400: 'var(--neutral-400)',
      500: 'var(--neutral-500)',
      600: 'var(--neutral-600)',
      700: 'var(--neutral-700)',
      800: 'var(--neutral-800)',
      900: 'var(--neutral-900)',
      950: 'var(--neutral-950)',
    },
  },

  typography: {
    fontDisplay: 'var(--font-display)',
    fontBody: 'var(--font-body)',
    fontMono: 'var(--font-data)',
    fontData: 'var(--font-data)',

    scale: {
      xs: { size: 'var(--text-xs)', lineHeight: 'var(--leading-xs)' },
      sm: { size: 'var(--text-sm)', lineHeight: 'var(--leading-sm)' },
      base: { size: 'var(--text-base)', lineHeight: 'var(--leading-base)' },
      lg: { size: 'var(--text-lg)', lineHeight: 'var(--leading-lg)' },
      xl: { size: 'var(--text-xl)', lineHeight: 'var(--leading-xl)' },
      '2xl': { size: 'var(--text-2xl)', lineHeight: 'var(--leading-2xl)' },
      '3xl': { size: 'var(--text-3xl)', lineHeight: 'var(--leading-3xl)' },
      '4xl': { size: 'var(--text-4xl)', lineHeight: 'var(--leading-4xl)' },
    },

    weights: {
      normal: 'var(--font-weight-normal)',
      medium: 'var(--font-weight-medium)',
      semibold: 'var(--font-weight-semibold)',
      bold: 'var(--font-weight-bold)',
      extrabold: 'var(--font-weight-extrabold)',
      black: 'var(--font-weight-black)',
    },
  },

  spacing: {
    '0': '0',
    '1': '0.25rem',
    '2': '0.5rem',
    '3': '0.75rem',
    '4': '1rem',
    '5': '1.25rem',
    '6': '1.5rem',
    '8': '2rem',
    '10': '2.5rem',
    '12': '3rem',
    '16': '4rem',
    '20': '5rem',
    '24': '6rem',
  },

  borders: {
    radius: {
      none: 'var(--radius-none)',
      sm: 'var(--radius-sm)',
      md: 'var(--radius-md)',
      lg: 'var(--radius-lg)',
      xl: 'var(--radius-xl)',
      '2xl': 'var(--radius-2xl)',
      full: 'var(--radius-full)',
    },
    width: {
      DEFAULT: 'var(--border-width-default)',
      thick: 'var(--border-width-thick)',
    },
  },

  shadows: {
    none: 'var(--shadow-0)',
    sm: 'var(--shadow-1)',
    md: 'var(--shadow-2)',
    lg: 'var(--shadow-3)',
    xl: 'var(--shadow-4)',
    glow: 'var(--shadow-glow)',
  },

  effects: {
    backdropBlur: 'var(--backdrop-blur)',
    glassOpacity: 'var(--glass-opacity)',
    transitionDefault: 'var(--transition-default)',
    transitionFast: 'var(--transition-fast)',
    transitionNormal: 'var(--transition-normal)',
    transitionSlow: 'var(--transition-slow)',
  },

  breakpoints: {
    sm: 'var(--breakpoint-sm)',
    md: 'var(--breakpoint-md)',
    lg: 'var(--breakpoint-lg)',
    xl: 'var(--breakpoint-xl)',
    '2xl': 'var(--breakpoint-2xl)',
  },

  zIndex: {
    hide: 'var(--z-hide)',
    base: 'var(--z-base)',
    dropdown: 'var(--z-dropdown)',
    sticky: 'var(--z-sticky)',
    fixed: 'var(--z-fixed)',
    'modal-backdrop': 'var(--z-modal-backdrop)',
    modal: 'var(--z-modal)',
    popover: 'var(--z-popover)',
    tooltip: 'var(--z-tooltip)',
    toast: 'var(--z-toast)',
  },
};