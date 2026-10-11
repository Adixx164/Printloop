# PrintLoop Design System

## Overview

**PrintLoop Design System v1.0** — A modern SaaS design system for PrintLoop. Clean, dense, data-dense, professional aesthetic. Inspired by Linear, Stripe, Vercel.

**Personality**: Clean, dense, data-dense, professional. Neutral grays with brand indigo accent. Semantic colors for state. Dense, efficient, data-dense interfaces.

---

## Color System

### Brand Colors (Indigo)
| Token | Hex | Usage |
|-------|-----|-------|
| `--color-brand-50` | `#EEF2FF` | Subtle backgrounds |
| `--color-brand-100` | `#E0E7FF` | Hover states, subtle accents |
| `--color-brand-200` | `#C7D2FE` | Borders, subtle UI |
| `--color-brand-400` | `#818CF8` | Interactive elements |
| `--color-brand-500` | `#6366F1` | Focus rings, links |
| `--color-brand-600` | `#4F46E5` | **Primary actions, buttons** |
| `--color-brand-700` | `#4338CA` | Hover states |
| `--color-brand-800` | `#3730A3` | Active/pressed states |

### Neutral Colors (Grayscale)
| Token | Hex | Usage |
|-------|-----|-------|
| `--color-neutral-0` | `#FFFFFF` | Pure white |
| `--color-neutral-50` | `#FAFAFA` | Page backgrounds |
| `--color-neutral-100` | `#F4F4F5` | Card backgrounds, secondary |
| `--color-neutral-200` | `#E4E4E7` | Borders, dividers |
| `--color-neutral-300` | `#D4D4D8` | Input borders, disabled |
| `--color-neutral-400` | `#A1A1AA` | Placeholders, secondary icons |
| `--color-neutral-500` | `#71717A` | Helper text, disabled text |
| `--color-neutral-600` | `#52525B` | Secondary text |
| `--color-neutral-700` | `#3F3F46` | Body text |
| `--color-neutral-800` | `#27272A` | Headings |
| `--color-neutral-900` | `#18181B` | Primary headings |
| `--color-neutral-950` | `#09090B` | Maximum contrast |

### Semantic Colors
| Role | Token | Usage |
|------|-------|-------|
| Primary | `--color-primary` | Primary buttons, key actions, links |
| Secondary | `--color-secondary` | Secondary buttons, outline buttons |
| Destructive | `--color-destructive` | Delete, remove, dangerous actions |
| Success | `--color-success-600` | Success states, completed |
| Warning | `--color-warning-600` | Warnings, pending states |
| Error | `--color-error-600` | Errors, validation failures |
| Info | `--color-info-600` | Informational states |

### Color Usage Rules
- ✅ **DO**: Use semantic color tokens (`--color-primary`, `--color-destructive`, etc.)
- ✅ **DO**: Use neutral scale for backgrounds, borders, text
- ❌ **DON'T**: Use brand colors directly in components
- ❌ **DON'T**: Mix semantic meanings (don't use success for primary actions)

---

## Typography

### Font Stack
| Role | Font | Source |
|------|------|--------|
| Display | Geist | Google Fonts |
| Body | Geist | Google Fonts |
| Mono | JetBrains Mono | Google Fonts |

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
```

### Type Scale
| Token | Size | Line Height | Weight | Usage |
|-------|------|-------------|--------|-------|
| `--text-xs` | 0.75rem (12px) | 1rem | 400 | Badges, timestamps, fine print |
| `--text-sm` | 0.875rem (14px) | 1.25rem | 400 | Captions, labels, helper text |
| `--text-base` | 1rem (16px) | 1.5rem | 400 | **Body text** |
| `--text-lg` | 1.125rem (18px) | 1.75rem | 500 | Lead text, card titles |
| `--text-xl` | 1.25rem (20px) | 1.75rem | 600 | Section headers |
| `--text-2xl` | 1.5rem (24px) | 2rem | 700 | Page titles |
| `--text-3xl` | 1.875rem (30px) | 2.25rem | 700 | Hero titles |
| `--text-4xl` | 2.25rem (36px) | 2.5rem | 800 | Display text, marketing hero |

### Font Weights
| Token | Weight | Usage |
|-------|--------|-------|
| `--font-weight-normal` | 400 | Body text |
| `--font-weight-medium` | 500 | Labels, emphasized text |
| `--font-weight-semibold` | 600 | Sub-headings, important values |
| `--font-weight-bold` | 700 | Headings, strong emphasis |
| `--font-weight-extrabold` | 800 | Hero headlines |

### Font Families
```css
--font-display: 'Geist', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
--font-body: 'Geist', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
--font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
```

---

## Spacing System

**Base Unit**: 4px (0.25rem)

| Token | Value | Pixels | Usage |
|-------|-------|--------|-------|
| `--space-0` | 0 | 0 | Reset |
| `--space-1` | 0.25rem | 4px | Tight gaps |
| `--space-2` | 0.5rem | 8px | Default gap |
| `--space-3` | 0.75rem | 12px | Medium gap |
| `--space-4` | 1rem | 16px | **Default padding** |
| `--space-5` | 1.25rem | 20px | Medium padding |
| `--space-6` | 1.5rem | 24px | Section spacing |
| `--space-8` | 2rem | 32px | Large section spacing |
| `--space-10` | 2.5rem | 40px | Hero sections |
| `--space-12` | 3rem | 48px | Page margins |

### Spacing Rules
- ✅ Use spacing scale exclusively
- ✅ Use `--space-4` (16px) as default container padding
- ✅ Use `--space-2` (8px) as default element gap
- ❌ Don't use arbitrary pixel values

---

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-none` | 0 | Sharp corners |
| `--radius-sm` | 4px | Badges, small inputs |
| `--radius-md` | 8px | **Default** - buttons, inputs, cards |
| `--radius-lg` | 12px | Cards, modals |
| `--radius-xl` | 16px | Large modals, sheets |
| `--radius-2xl` | 24px | Hero sections |
| `--radius-full` | 9999px | Pills, avatars |

---

## Shadows (4-Level Elevation)

| Level | Token | Usage |
|-------|-------|-------|
| 0 | `--shadow-0` | Flat, no elevation |
| 1 | `--shadow-1` | Subtle - inputs, badges |
| 2 | `--shadow-2` | **Default** - cards, dropdowns |
| 3 | `--shadow-3` | Elevated - modals, dialogs |
| 4 | `--shadow-4` | High - floating panels |
| Glow | `--shadow-glow` | Focus rings, brand emphasis |

---

## Component Tokens

### Button Variants
```css
/* Primary - Main actions */
--btn-primary-bg: var(--color-primary);
--btn-primary-hover: var(--color-primary-hover);
--btn-primary-fg: var(--color-primary-foreground);

/* Secondary - Supporting actions */
--btn-secondary-bg: var(--color-secondary);
--btn-secondary-hover: var(--color-secondary-hover);
--btn-secondary-fg: var(--color-secondary-foreground);

/* Outline - Secondary actions */
--btn-outline-bg: transparent;
--btn-outline-border: var(--color-border);
--btn-outline-fg: var(--color-foreground);

/* Ghost - Subtle actions */
--btn-ghost-bg: transparent;
--btn-ghost-hover: var(--color-accent);
--btn-ghost-fg: var(--color-foreground);

/* Destructive - Dangerous actions */
--btn-destructive-bg: var(--color-destructive);
--btn-destructive-hover: var(--color-destructive-hover);
--btn-destructive-fg: var(--color-destructive-foreground);

/* Sizes */
--btn-sm: var(--space-2) var(--space-3);   /* 8px 12px */
--btn-md: var(--space-3) var(--space-4);   /* 12px 16px */
--btn-lg: var(--space-4) var(--space-6);   /* 16px 24px */
```

### Input States
```css
--input-bg: var(--color-background);
--input-border: var(--color-input);
--input-border-hover: var(--color-border);
--input-border-focus: var(--color-ring);
--input-error: var(--color-error-500);
--input-fg: var(--color-foreground);
--input-placeholder: var(--color-muted-foreground);
```

### Card
```css
--card-bg: var(--color-card);
--card-border: var(--color-border);
--card-radius: var(--radius-lg);
--card-shadow: var(--shadow-2);
--card-padding: var(--space-6);
```

---

## Animation & Motion

### Durations
```css
--duration-fast: 150ms;     /* Micro-interactions */
--duration-normal: 200ms;   /* Default transitions */
--duration-slow: 300ms;     /* Modals, drawers */
```

### Easing
```css
--ease-out: cubic-bezier(0.4, 0, 0.2, 1);    /* Default */
--ease-in: cubic-bezier(0.4, 0, 1, 1);       /* Entrance */
--ease-out: cubic-bezier(0, 0, 0.2, 1);      /* Exit */
--ease-spring: cubic-bezier(0.16, 1, 0.3, 1); /* Bouncy */
```

### Reduced Motion
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Component Patterns

### Button
```tsx
<Button variant="primary" size="md">
  Primary Action
</Button>

<Button variant="secondary" size="md">
  Secondary Action
</Button>

<Button variant="outline" size="md">
  Outline Action
</Button>

<Button variant="ghost" size="md">
  Ghost Action
</Button>

<Button variant="destructive" size="md">
  Delete
</Button>
```

### Input
```tsx
<FormField
  label="Email"
  error={errors.email?.message}
>
  <Input
    type="email"
    value={email}
    onChange={e => setEmail(e.target.value)}
    placeholder="you@example.com"
  />
</FormField>
```

### Card
```tsx
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>Content</CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>
```

---

## AI Agent Instructions

> **FOR AI CODING AGENTS**: This section is designed to be pasted into your system prompt or CLAUDE.md

### Design System Rules (MUST FOLLOW)

1. **Colors**: ONLY use semantic color tokens (`--color-primary`, `--color-destructive`, etc.). NEVER use raw hex values or brand colors directly.

2. **Spacing**: ONLY use spacing scale tokens (`--space-1` through `--space-24`). NEVER use arbitrary pixel values.

3. **Typography**: Use type scale tokens (`--text-xs` through `--text-4xl`). Match weight to purpose.

4. **Radius**: Use radius tokens (`--radius-md` default). Never hardcode `rounded-lg` etc.

5. **Shadows**: Use elevation tokens (`--shadow-1` through `--shadow-4`). No custom box-shadows.

5. **Components**: Compose from primitives. Don't write custom CSS for standard components.

5. **Animations**: Use duration/easing tokens. Respect `prefers-reduced-motion`.

5. **Responsive**: Mobile-first. Use breakpoint tokens (`--breakpoint-sm` etc.)

6. **Dark Mode**: All colors work in dark mode via CSS variables. Test both modes.

### Component Composition Rules

- **Button**: Compose from `ButtonPrimitive` + variant props
- **Input**: Compose `Label` + `Input` + `FormMessage` via `FormField`
- **Card**: Compose `Card` + `CardHeader` + `CardContent` + `CardFooter`
- **Form**: Use `react-hook-form` + `zod` via `FormField` components

### Forbidden Patterns
- ❌ `className="bg-blue-600"` → Use `variant="primary"`
- ❌ `style={{ padding: '12px' }}` → Use `className="p-4"` or `className="p-6"`
- ❌ `boxShadow: '0 4px 6px rgba(0,0,0,0.1)'` → Use `shadow-2`
- ❌ `borderRadius: '12px'` → Use `rounded-lg` or `rounded-xl`
- ❌ `fontSize: '14px'` → Use `text-sm` or `text-base`

---

## Accessibility Checklist

- [ ] All interactive elements have focus-visible styles
- [ ] Color contrast meets WCAG AA (4.5:1 text, 3:1 UI)
- [ ] All form inputs have associated labels
- [ ] Error messages linked via `aria-describedby`
- [ ] Focus trapping in modals/drawers
- [ ] Skip links for main content
- [ ] ARIA labels on icon-only buttons
- [ ] Live regions for toast notifications
- [ ] Reduced motion respected

---

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

---

## File Structure

```
design-system-printloop/
├── design-tokens.json          # Machine-readable tokens
├── design-system.css           # CSS variables + base styles
├── design-system.md            # This documentation
└── design-system-preview.html  # Visual reference
```

---

## Usage

### In React Components
```tsx
import '@/packages/ui/design-system/design-system.css';

function MyComponent() {
  return (
    <div className="p-6 bg-card border border-border rounded-lg shadow-2">
      <h1 className="text-2xl font-bold text-foreground">Title</h1>
      <Button variant="primary">Action</Button>
    </div>
  );
}
```

### In Tailwind Config
```js
// tailwind.config.js
import designTokens from '@printloop/ui/design-tokens.json';

export default {
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: designTokens.colors.semantic.primary.value,
          foreground: designTokens.colors.semantic.primaryForeground.value,
        },
        // ...
      },
      fontFamily: {
        display: [designTokens.typography.fontDisplay.family],
        body: [designTokens.typography.fontBody.family],
        mono: [designTokens.typography.fontMono.family],
      },
      // ... map all tokens
    },
  },
};
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-09-29 | Initial release - Modern SaaS design system |

---

*This design system is the single source of truth for PrintLoop UI. All components, pages, and features MUST use these tokens.*