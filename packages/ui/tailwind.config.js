/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.ts',
    './src/**/*.{ts,tsx}',
    '../../printloop-new-frontend/src/**/*.{ts,tsx}',
    '../../printloop-new-frontend/src/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Design system semantic colors
        primary: {
          DEFAULT: 'var(--color-primary)',
          foreground: 'var(--color-primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--color-secondary)',
          foreground: 'var(--color-secondary-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--color-destructive)',
          foreground: 'var(--color-destructive-foreground)',
        },
        muted: {
          DEFAULT: 'var(--color-muted)',
          foreground: 'var(--color-muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          foreground: 'var(--color-accent-foreground)',
        },
        border: 'var(--color-border)',
        input: 'var(--color-input)',
        ring: 'var(--color-ring)',

        // Semantic states
        success: 'var(--color-success-600)',
        warning: 'var(--color-warning-600)',
        error: 'var(--color-error-600)',
        info: 'var(--color-info-600)',

        // Neutral scale
        background: 'var(--color-background)',
        foreground: 'var(--color-foreground)',
        card: 'var(--color-card)',
        cardForeground: 'var(--color-card-foreground)',
        popover: 'var(--color-popover)',
        popoverForeground: 'var(--color-popover-foreground)',

        // Brand scale
        brand: {
          50: 'var(--color-brand-50)',
          100: 'var(--color-brand-100)',
          200: 'var(--color-brand-200)',
          300: 'var(--color-brand-300)',
          400: 'var(--color-brand-400)',
          500: 'var(--color-brand-500)',
          600: 'var(--color-brand-600)',
          700: 'var(--color-brand-700)',
          800: 'var(--color-brand-800)',
          900: 'var(--color-brand-900)',
          950: 'var(--color-brand-950)',
        },

        // Neutral scale
        neutral: {
          0: 'var(--color-neutral-0)',
          50: 'var(--color-neutral-50)',
          100: 'var(--color-neutral-100)',
          200: 'var(--color-neutral-200)',
          300: 'var(--color-neutral-300)',
          400: 'var(--color-neutral-400)',
          500: 'var(--color-neutral-500)',
          600: 'var(--color-neutral-600)',
          700: 'var(--color-neutral-700)',
          800: 'var(--color-neutral-800)',
          900: 'var(--color-neutral-900)',
          950: 'var(--color-neutral-950)',
        },

        // Ink utilities (six print-shop inks)
        sheet: 'var(--sheet)',
        paper: 'var(--paper)',
        toner: 'var(--toner)',
        'ink-soft': 'var(--ink-soft)',
        process: 'var(--process)',
        'process-ink': 'var(--process-ink)',
        register: 'var(--register)',
        highlight: 'var(--highlight)',
        pass: 'var(--pass)',
        hairline: 'var(--hairline)',
      },

      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
        data: ['var(--font-data)'],
        mono: ['var(--font-mono)'],
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
        '0': 'var(--space-0)',
        '1': 'var(--space-1)',
        '2': 'var(--space-2)',
        '3': 'var(--space-3)',
        '4': 'var(--space-4)',
        '5': 'var(--space-5)',
        '6': 'var(--space-6)',
        '8': 'var(--space-8)',
        '10': 'var(--space-10)',
        '12': 'var(--space-12)',
        '16': 'var(--space-16)',
        '20': 'var(--space-20)',
        '24': 'var(--space-24)',
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
  plugins: [
    require('tailwindcss-animate'),
    function ({ addComponents }) {
      const btnBase = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-2)',
        padding: 'var(--space-3) var(--space-4)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid transparent',
        fontFamily: 'var(--font-display)',
        fontSize: 'var(--text-sm)',
        fontWeight: '600',
        letterSpacing: '0.02em',
        textDecoration: 'none',
        cursor: 'pointer',
        transition: 'background .15s ease, color .15s ease, border-color .15s ease',
        '&:active': {
          filter: 'brightness(.95)',
        },
        '&:focus-visible': {
          outline: '3px solid var(--process)',
          outlineOffset: '3px',
        },
      };

      addComponents({
        '.btn': btnBase,

        // Primary — process ink
        '.btn-primary': {
          ...btnBase,
          backgroundColor: 'var(--process)',
          color: 'var(--paper)',
        },
        '.btn-primary:hover': {
          backgroundColor: 'var(--primary-hover)',
        },

        // Danger — register red
        '.btn-danger': {
          ...btnBase,
          backgroundColor: 'var(--register)',
          color: 'var(--paper)',
        },
        '.btn-danger:hover': {
          backgroundColor: 'var(--danger-hover)',
        },

        // Ghost — text only, underlines on hover
        '.btn-ghost': {
          ...btnBase,
          backgroundColor: 'transparent',
          color: 'var(--process-ink)',
        },
        '.btn-ghost:hover': {
          backgroundColor: 'var(--ghost-hover)',
          textDecoration: 'underline',
        },

        // Secondary — paper on hairline
        '.btn-secondary': {
          ...btnBase,
          backgroundColor: 'var(--paper)',
          color: 'var(--toner)',
          border: '1px solid var(--hairline)',
        },
        '.btn-secondary:hover': {
          backgroundColor: 'var(--btn-hover)',
        },

        // Outline — transparent on hairline
        '.btn-outline': {
          ...btnBase,
          backgroundColor: 'transparent',
          color: 'var(--toner)',
          border: '1px solid var(--hairline)',
        },
        '.btn-outline:hover': {
          backgroundColor: 'var(--btn-hover)',
        },

        // Destructive — compat alias for .btn-danger
        '.btn-destructive': {
          ...btnBase,
          backgroundColor: 'var(--register)',
          color: 'var(--paper)',
        },
        '.btn-destructive:hover': {
          backgroundColor: 'var(--danger-hover)',
        },

        // Card — paper sheet with hard offset shadow
        '.card': {
          padding: 'var(--space-6)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--hairline)',
          backgroundColor: 'var(--paper)',
          color: 'var(--toner)',
          boxShadow: 'var(--shadow-1)',
        },

        // Input field — 1px hairline
        '.input': {
          width: '100%',
          padding: 'var(--space-3) var(--space-3)',
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-sm)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--hairline)',
          backgroundColor: 'var(--paper)',
          color: 'var(--toner)',
          transition: 'border-color .15s ease, box-shadow .15s ease',
          '&:focus': {
            outline: 'none',
            borderColor: 'var(--process)',
            boxShadow: 'var(--shadow-glow)',
          },
          '&.has-error': {
            borderColor: 'var(--register)',
          },
        },

        // Badge — fill only, uppercase data label
        '.badge': {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-1) var(--space-2)',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: 'var(--badge-bg)',
          color: 'var(--toner)',
          fontFamily: 'var(--font-data)',
          fontSize: 'var(--text-xs)',
          fontWeight: '600',
          lineHeight: '1',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          '&::before': {
            content: '""',
            width: '7px',
            height: '7px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'currentColor',
          },
        },
        '.badge-ready': {
          backgroundColor: 'var(--badge-ready)',
          color: 'var(--pass)',
        },
        '.badge-render': {
          backgroundColor: 'var(--badge-render)',
          color: 'var(--process-ink)',
        },
        '.badge-error': {
          backgroundColor: 'var(--alert-bg)',
          color: 'var(--register)',
        },
      });
    },
  ],
};