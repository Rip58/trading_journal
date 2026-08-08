import './globals.css';

export const metadata = {
  title: 'Huella Digital — analiza y borra tu rastro en internet',
  description:
    'Descubre dónde estás expuesto en internet y genera las solicitudes de borrado que exige el RGPD.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
