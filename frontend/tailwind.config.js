/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'wingman': {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        },
        'island': {
          bg: 'rgba(0, 0, 0, 0.85)',
          border: 'rgba(255, 255, 255, 0.1)',
          glow: 'rgba(14, 165, 233, 0.4)',
          success: 'rgba(34, 197, 94, 0.8)',
          error: 'rgba(239, 68, 68, 0.8)',
          warning: 'rgba(234, 179, 8, 0.8)',
        }
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'shimmer': 'shimmer 2s linear infinite',
        'float': 'float 6s ease-in-out infinite',
        'wave': 'wave 1s ease-in-out infinite',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 20px rgba(14, 165, 233, 0.2)' },
          '100%': { boxShadow: '0 0 40px rgba(14, 165, 233, 0.4)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        wave: {
          '0%, 100%': { transform: 'scaleY(1)' },
          '50%': { transform: 'scaleY(1.5)' },
        }
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'island': '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        'island-glow': '0 0 40px rgba(14, 165, 233, 0.3), 0 8px 32px rgba(0, 0, 0, 0.4)',
      }
    },
  },
  plugins: [],
}

