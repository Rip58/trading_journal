import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Acceso a los catálogos vendorizados de data/.
 *
 * Se leen del disco una sola vez y se cachean en memoria del proceso. Son 1 MB
 * entre los tres, así que importarlos estáticamente los metería en cada bundle
 * que los toque; leerlos bajo demanda los deja donde deben estar, en el
 * servidor, y una función Lambda caliente los reutiliza entre invocaciones.
 */

const DIR_DATOS = join(process.cwd(), 'data');

let cache = null;

async function cargar() {
  if (cache) return cache;
  const [sitios, servicios, indice] = await Promise.all([
    readFile(join(DIR_DATOS, 'sitios.json'), 'utf8').then(JSON.parse),
    readFile(join(DIR_DATOS, 'servicios.json'), 'utf8').then(JSON.parse),
    readFile(join(DIR_DATOS, 'servicios-indice.json'), 'utf8').then(JSON.parse),
  ]);
  cache = { sitios, servicios, indice };
  return cache;
}

/**
 * Sitios a escanear para un nivel dado.
 * Vienen ya ordenados por puntuación, así que los hallazgos con más señal
 * aparecen en pantalla en las primeras tandas.
 */
export async function sitiosParaEscanear({ nivel, incluirSensibles = false }) {
  const { sitios } = await cargar();
  return sitios.filter((s) => {
    if (s.sensible && !incluirSensibles) return false;
    if (nivel === 'GRATIS') return s.gratis;
    return true;
  });
}

/** Instrucciones de baja de un dominio, o null si no las tenemos. */
export async function bajaDeDominio(dominio) {
  const { servicios, indice } = await cargar();
  const i = indice[dominio];
  return i === undefined ? null : servicios[i];
}

/** Instrucciones de baja a partir del índice que ya trae el sitio. */
export async function bajaPorIndice(i) {
  if (i === null || i === undefined) return null;
  const { servicios } = await cargar();
  return servicios[i] ?? null;
}
