/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        stellar: {
          blue: "#3b82f6",
          dark: "#0b0f19",
          slate: "#1f2937",
          accent: "#10b981",
        }
      }
    },
  },
  plugins: [],
}
