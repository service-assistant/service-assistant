/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require("nativewind/preset")],
  darkMode: "class",
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b1118",
        panel: "#161d26",
        panelSoft: "#202832",
        line: "#2d3745",
        cream: "#ffe1bf",
        ember: "#ff8a00"
      },
      fontFamily: {
        sans: ["Inter", "Arial", "sans-serif"]
      }
    }
  },
  plugins: []
};
