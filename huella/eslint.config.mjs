import coreWebVitals from 'eslint-config-next/core-web-vitals';

// Next 16 publica @next/eslint-plugin-next ya en flat config, así que se
// importa directamente. FlatCompat sobra aquí y además rompe: al envolver este
// config produce una referencia circular que ESLint no puede serializar.
const config = [
  ...coreWebVitals,
  { ignores: ['.next/**', 'node_modules/**', 'data/**'] },
];

export default config;
