// Manifiesto para instalar la app en la pantalla de inicio. En modo
// standalone desaparece la barra de Safari, que en un iPhone son ~100px.
export default function manifest() {
  return {
    name: "Trading Journal",
    short_name: "Journal",
    description: "Diario de trading en futuros NQ",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0A0A0A",
    theme_color: "#0A0A0A",
    // Solo "any": el icono va a sangre completa, y como "maskable" Android lo
    // recortaría en círculo comiéndose las puntas de las flechas.
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-touch-icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
