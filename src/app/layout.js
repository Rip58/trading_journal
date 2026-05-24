import "./globals.css";

export const metadata = {
  title: "Diario de Trading",
  description: "Registro y analíticas de mis trades en futuros",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <div id="root">{children}</div>
      </body>
    </html>
  );
}
