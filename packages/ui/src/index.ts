// PrintLoop UI Component Library — six-ink press edition
// Consumes design tokens from the co-located design-system/ folder

export * from './components';

// Design tokens (imported from JSON for type-safe consumption)
import designTokensJson from '../design-system/design-tokens.json';
export const designTokens = designTokensJson;
export type DesignTokens = typeof designTokensJson;

// Re-export Tailwind config mapped to six-ink CSS variables
export const tailwindConfig = {
  theme: {
    extend: {
      colors: {
        // Six-ink semantic aliases
        primary: 'var(--process)',
        primaryHover: 'var(--process-ink)',
        destructive: 'var(--register)',
        destructiveHover: 'var(--register)',
        muted: 'var(--muted)',
        accent: 'var(--highlight)',
        border: 'var(--hairline)',
        input: 'var(--hairline)',
        ring: 'var(--process)',

        success: 'var(--pass)',
        warning: 'var(--ochre)',
        error: 'var(--register)',
        info: 'var(--process)',

        background: 'var(--sheet)',
        foreground: 'var(--toner)',
        card: 'var(--paper)',
        cardForeground: 'var(--toner)',
        popover: 'var(--paper)',
        popoverForeground: 'var(--toner)',

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

      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
        mono: ['var(--font-data)'],
        data: ['var(--font-data)'],
      },

      fontSize: {
        xs: ['var(--text-xs)', { lineHeight: 'var(--leading-xs)' }],
        sm: ['var(--text-sm)', { lineHeight: 'var(--leading-sm)' }],
        base: ['var(--text-base)', { lineHeight: 'var(--leading-base)' }],
        lg: ['var(--text-lg)', { lineHeight: 'var(--leading-lg)' }],
        xl: ['var(--text-xl)', { lineHeight: 'var(--leading-xl)' }],
        '2xl': ['var(--text-2xl)', { lineHeight: 'var(--leading-2xl)' }],
        '3xl': ['var(--text-3xl)', { lineHeight: 'var(--leading-3xl)' }],
        '4xl': ['var(--text-4xl)', { lineHeight: 'var(--leading-4xl)' }],
      },

      fontWeight: {
        normal: 'var(--font-weight-normal)',
        medium: 'var(--font-weight-medium)',
        semibold: 'var(--font-weight-semibold)',
        bold: 'var(--font-weight-bold)',
        extrabold: 'var(--font-weight-extrabold)',
        black: 'var(--font-weight-black)',
      },

      spacing: {
        // Six-ink uses direct rem values; map common steps
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

      borderRadius: {
        none: 'var(--radius-none)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        full: 'var(--radius-full)',
      },

      boxShadow: {
        none: 'var(--shadow-0)',
        sm: 'var(--shadow-1)',
        md: 'var(--shadow-2)',
        lg: 'var(--shadow-3)',
        xl: 'var(--shadow-4)',
        glow: 'var(--shadow-glow)',
      },

      transitionProperty: {
        DEFAULT: 'var(--transition-default)',
        fast: 'var(--transition-fast)',
        normal: 'var(--transition-normal)',
        slow: 'var(--transition-slow)',
      },

      borderWidth: {
        DEFAULT: 'var(--border-width-default)',
        thick: 'var(--border-width-thick)',
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

      screens: {
        sm: 'var(--breakpoint-sm)',
        md: 'var(--breakpoint-md)',
        lg: 'var(--breakpoint-lg)',
        xl: 'var(--breakpoint-xl)',
        '2xl': 'var(--breakpoint-2xl)',
      },
    },
  },
};