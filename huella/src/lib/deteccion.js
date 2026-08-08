/**
 * Núcleo de detección de cuentas por alias.
 *
 * Deliberadamente puro: sin base de datos, sin Next, sin estado global. Así se
 * puede medir su precisión desde un script (scripts/medir-precision.mjs) contra
 * los usuarios reales que trae el propio dataset, sin levantar la aplicación.
 */

export const ENCONTRADO = 'ENCONTRADO';
export const NO_ENCONTRADO = 'NO_ENCONTRADO';
export const NO_CONCLUYENTE = 'NO_CONCLUYENTE';

/** Un navegador creíble. Varios sitios responden distinto sin esto. */
const UA_POR_DEFECTO =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const TIEMPO_LIMITE_MS = 6000;

/** Tope de lectura del cuerpo. Sin esto, una página enorme se come la memoria. */
const MAX_BYTES = 512 * 1024;

/**
 * Alias admisibles. Restringir el juego de caracteres no es cosmético: el valor
 * se interpola en URLs y en cuerpos JSON, así que limitarlo aquí es lo que
 * evita tanto romper el JSON como inyectar en la URL.
 */
const ALIAS_VALIDO = /^[A-Za-z0-9._~-]{1,64}$/;

export function aliasEsValido(alias) {
  return typeof alias === 'string' && ALIAS_VALIDO.test(alias);
}

/**
 * Decide el veredicto a partir de la respuesta.
 *
 * Separado del fetch para poder probarlo sin red. El orden importa: hay sitios
 * donde el código de "existe" y el de "no existe" son el mismo (Discord
 * devuelve 200 en ambos casos) y solo los distingue la cadena, así que la
 * comprobación de existencia va primero.
 */
export function interpretar(sitio, estado, cuerpo) {
  const codigoCoincide = estado === sitio.eCode;
  const cadenaCoincide = sitio.eString ? cuerpo.includes(sitio.eString) : true;
  if (codigoCoincide && cadenaCoincide) return ENCONTRADO;

  const noCodigo = estado === sitio.mCode;
  const noCadena = sitio.mString ? cuerpo.includes(sitio.mString) : false;
  if (noCodigo || noCadena) return NO_ENCONTRADO;

  // Ni una cosa ni la otra: bloqueo, redirección rara, 429, o el sitio cambió
  // su HTML y la regla del catálogo se quedó vieja. No es un "no encontrado".
  return NO_CONCLUYENTE;
}

/** Lee el cuerpo con tope de tamaño, sin cargar páginas gigantes enteras. */
async function leerAcotado(res) {
  if (!res.body) return await res.text();
  const lector = res.body.getReader();
  const trozos = [];
  let total = 0;
  try {
    while (total < MAX_BYTES) {
      const { done, value } = await lector.read();
      if (done) break;
      trozos.push(value);
      total += value.length;
    }
  } finally {
    // Cancelar libera la conexión aunque hayamos parado a media descarga.
    lector.cancel().catch(() => {});
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(
    Buffer.concat(trozos.map((t) => Buffer.from(t)))
  );
}

/**
 * Comprueba un alias en un sitio del catálogo.
 * Nunca lanza: un fallo de red es un resultado (NO_CONCLUYENTE), no una excepción.
 */
export async function comprobarSitio(sitio, alias, opciones = {}) {
  const { tiempoLimiteMs = TIEMPO_LIMITE_MS, fetchImpl = fetch } = opciones;

  let cuenta = alias;
  if (sitio.stripBadChar) {
    for (const c of sitio.stripBadChar) cuenta = cuenta.split(c).join('');
  }
  if (!aliasEsValido(cuenta)) {
    return { confianza: NO_CONCLUYENTE, motivo: 'alias-no-valido' };
  }

  const url = sitio.uri.replaceAll('{account}', encodeURIComponent(cuenta));
  const urlVisible = (sitio.uriBonita || sitio.uri).replaceAll(
    '{account}',
    encodeURIComponent(cuenta)
  );

  const cabeceras = { 'User-Agent': UA_POR_DEFECTO, ...(sitio.cabeceras || {}) };
  const init = {
    method: sitio.cuerpoPost ? 'POST' : 'GET',
    headers: cabeceras,
    redirect: 'follow',
    signal: AbortSignal.timeout(tiempoLimiteMs),
  };
  if (sitio.cuerpoPost) {
    init.body = sitio.cuerpoPost.replaceAll('{account}', cuenta);
  }

  const inicio = Date.now();
  try {
    const res = await fetchImpl(url, init);
    const cuerpo = await leerAcotado(res);
    return {
      confianza: interpretar(sitio, res.status, cuerpo),
      estado: res.status,
      url: urlVisible,
      ms: Date.now() - inicio,
    };
  } catch (err) {
    const motivo =
      err.name === 'TimeoutError' || err.name === 'AbortError'
        ? 'tiempo-agotado'
        : 'error-red';
    return {
      confianza: NO_CONCLUYENTE,
      motivo,
      url: urlVisible,
      ms: Date.now() - inicio,
    };
  }
}

/**
 * Ejecuta comprobaciones con un tope de peticiones simultáneas.
 *
 * Un Promise.all sobre 40 sitios abre 40 conexiones de golpe, que es la forma
 * más rápida de que te tomen por un escáner y te bloqueen. Con un pool las
 * peticiones se solapan pero el pico se mantiene acotado.
 */
export async function conConcurrencia(elementos, limite, tarea) {
  const resultados = new Array(elementos.length);
  let siguiente = 0;

  async function trabajador() {
    while (true) {
      const i = siguiente++;
      if (i >= elementos.length) return;
      resultados[i] = await tarea(elementos[i], i);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limite, elementos.length) }, trabajador)
  );
  return resultados;
}
