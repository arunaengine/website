/** @type {import('tailwindcss').Config} */
module.exports = {
  // The article markdown classes are set in nuxt.config.ts
  content: ['./nuxt.config.ts'],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        aruna: {
          // V3 brand scale: aqua, sky, tagline blue, royal, navy
          50: '#EAF6FC',
          100: '#D3EEF8',
          200: '#A9DCF0',
          300: '#7DCFE7',
          400: '#55C4DE',
          500: '#24A9E6',
          600: '#4E86D7',
          700: '#335DC6',
          800: '#26479F',
          900: '#08216C',
          950: '#051548',
          text: "hsl(var(--aruna-text))",
          'text-accent': "hsl(var(--aruna-text-accent))",
          highlight: "hsl(var(--aruna-highlight))",
          muted: "hsl(var(--aruna-muted))",
          bg: "hsl(var(--aruna-background))",
          fg: "hsl(var(--aruna-foreground))",
          navy: '#08216C',
          tagline: '#4E86D7',
          aqua: '#55C4DE',
          sky: '#24A9E6',
          royal: '#335DC6',
          indigo: '#363EC9',
        },
        // Default grays replaced by the V3 neutrals
        gray: {
          50: '#F6F7FA',
          100: '#ECEEF3',
          200: '#E5E7EC',
          300: '#D1D5DC',
          400: '#99A2B8',
          500: '#737B8F',
          600: '#51515C',
          700: '#3E3E46',
          800: '#232329',
          900: '#16161A',
          950: '#0B0B0E',
        },
        slate: {
          50: '#F6F7FA',
          100: '#ECEEF3',
          200: '#E5E7EC',
          300: '#D1D5DC',
          400: '#99A2B8',
          500: '#737B8F',
          600: '#51515C',
          700: '#3E3E46',
          800: '#232329',
          900: '#16161A',
          950: '#0B0B0E',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Space Grotesk', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {height: 0},
          to: {height: "var(--radix-accordion-content-height)"},
        },
        "accordion-up": {
          from: {height: "var(--radix-accordion-content-height)"},
          to: {height: 0},
        },
        "collapsible-down": {
          from: {height: 0},
          to: {height: 'var(--radix-collapsible-content-height)'},
        },
        "collapsible-up": {
          from: {height: 'var(--radix-collapsible-content-height)'},
          to: {height: 0},
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "collapsible-down": "collapsible-down 0.2s ease-in-out",
        "collapsible-up": "collapsible-up 0.2s ease-in-out",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    require("@tailwindcss/forms"),
    require("preline/plugin"),
  ],
}