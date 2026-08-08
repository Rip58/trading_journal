/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: { root: import.meta.dirname },

  // Next 16 bloquea por defecto los recursos de desarrollo pedidos desde otro
  // origen. Entrar por 127.0.0.1 en vez de localhost, o desde el móvil por la
  // IP de la red local, rompe el runtime de dev y la página deja de hidratar
  // sin decir por qué — el aviso solo sale en la consola del servidor.
  // No afecta a producción.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
};

export default nextConfig;
