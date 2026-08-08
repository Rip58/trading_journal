#!/usr/bin/env node
/**
 * Prueba sin red de la lógica de decisión.
 *
 *   node scripts/probar-deteccion.mjs
 *
 * medir-precision.mjs necesita salida a internet y mide el mundo real. Esto
 * mide otra cosa distinta y complementaria: que las reglas del catálogo estén
 * bien interpretadas. Para cada uno de los 664 sitios se fabrica la respuesta
 * que su propia regla define como "existe" y la que define como "no existe", y
 * se comprueba que el detector emite el veredicto correcto.
 *
 * Coge fallos que un test con red esconde: sitios donde el código de existir y
 * el de no existir coinciden (Discord devuelve 200 en ambos), reglas sin cadena
 * de comprobación, y cadenas que aparecen por accidente en la respuesta contraria.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  interpretar,
  comprobarSitio,
  aliasEsValido,
  ENCONTRADO,
  NO_ENCONTRADO,
  NO_CONCLUYENTE,
} from '../src/lib/deteccion.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

let pasadas = 0;
const fallos = [];

function comprobar(nombre, real, esperado, detalle = '') {
  if (real === esperado) pasadas++;
  else fallos.push(`${nombre}: esperaba ${esperado}, obtuvo ${real} ${detalle}`);
}

async function main() {
  const sitios = JSON.parse(
    await readFile(join(RAIZ, 'data', 'sitios.json'), 'utf8')
  );

  // --- 1. Las reglas de cada sitio se interpretan bien ------------------
  let sinCadenaExiste = 0;
  let codigosIguales = 0;
  let ambiguos = 0;

  for (const s of sitios) {
    if (!s.eString) sinCadenaExiste++;
    if (s.eCode === s.mCode) codigosIguales++;

    // Respuesta que, según la regla del propio sitio, significa "existe".
    const cuerpoExiste = `prefijo ${s.eString || ''} sufijo`;
    comprobar(
      `${s.nombre} [existe]`,
      interpretar(s, s.eCode, cuerpoExiste),
      ENCONTRADO
    );

    // Respuesta que significa "no existe". Si el sitio define mString la
    // usamos; si no, basta con el mCode.
    const cuerpoNoExiste = s.mString ? `prefijo ${s.mString} sufijo` : 'vacio';
    const veredictoNo = interpretar(s, s.mCode, cuerpoNoExiste);

    // Caso legítimamente ambiguo: mismo código y la cadena de "existe" está
    // vacía, así que cualquier respuesta con ese código parece un acierto.
    // No es un fallo del detector, es una regla del catálogo que no discrimina.
    if (s.eCode === s.mCode && !s.eString) {
      ambiguos++;
    } else {
      comprobar(`${s.nombre} [no existe]`, veredictoNo, NO_ENCONTRADO);
    }
  }

  // --- 2. Casos límite --------------------------------------------------
  const discord = sitios.find((s) => s.nombre === 'Discord (User)');
  if (discord) {
    comprobar(
      'Discord mismo código 200, distingue por cadena',
      interpretar(discord, 200, '{"taken":true}'),
      ENCONTRADO
    );
    comprobar(
      'Discord mismo código 200, alias libre',
      interpretar(discord, 200, '{"taken":false}'),
      NO_ENCONTRADO
    );
  }

  const cualquiera = sitios[0];
  comprobar(
    'código inesperado no es NO_ENCONTRADO',
    interpretar(cualquiera, 429, 'Too Many Requests'),
    NO_CONCLUYENTE
  );
  comprobar(
    'bloqueo 403 no es NO_ENCONTRADO',
    interpretar(cualquiera, 403, 'Forbidden'),
    NO_CONCLUYENTE
  );

  // --- 3. Validación de alias ------------------------------------------
  comprobar('alias normal válido', aliasEsValido('rip58'), true);
  comprobar('alias con guion válido', aliasEsValido('ana-lopez_92'), true);
  comprobar('alias con espacio rechazado', aliasEsValido('Travis Branham'), false);
  comprobar('alias con comilla rechazado', aliasEsValido('a"b'), false);
  comprobar('alias con barra rechazado', aliasEsValido('a/../b'), false);
  comprobar('alias vacío rechazado', aliasEsValido(''), false);
  comprobar('alias larguísimo rechazado', aliasEsValido('a'.repeat(65)), false);

  // --- 4. comprobarSitio con red simulada -------------------------------
  const sitioFalso = {
    nombre: 'Prueba',
    uri: 'https://ejemplo.test/u/{account}',
    eCode: 200,
    eString: '"id":',
    mCode: 404,
    mString: 'Not Found',
  };

  const fetchOk = async () => new Response('{"id": 7}', { status: 200 });
  const fetch404 = async () => new Response('Not Found', { status: 404 });
  const fetchCae = async () => {
    throw Object.assign(new Error('sin red'), { name: 'TypeError' });
  };
  const fetchTardio = async () => {
    throw Object.assign(new Error('tarde'), { name: 'TimeoutError' });
  };

  comprobar(
    'comprobarSitio detecta cuenta',
    (await comprobarSitio(sitioFalso, 'alguien', { fetchImpl: fetchOk })).confianza,
    ENCONTRADO
  );
  comprobar(
    'comprobarSitio descarta cuenta',
    (await comprobarSitio(sitioFalso, 'alguien', { fetchImpl: fetch404 })).confianza,
    NO_ENCONTRADO
  );
  comprobar(
    'fallo de red da NO_CONCLUYENTE, no NO_ENCONTRADO',
    (await comprobarSitio(sitioFalso, 'alguien', { fetchImpl: fetchCae })).confianza,
    NO_CONCLUYENTE
  );
  comprobar(
    'tiempo agotado da NO_CONCLUYENTE',
    (await comprobarSitio(sitioFalso, 'alguien', { fetchImpl: fetchTardio })).confianza,
    NO_CONCLUYENTE
  );
  comprobar(
    'alias inválido no llega a hacer petición',
    (await comprobarSitio(sitioFalso, 'con espacio', { fetchImpl: fetchOk })).motivo,
    'alias-no-valido'
  );

  // El alias se interpola codificado: nunca debe poder salirse de la ruta.
  let urlPedida = '';
  await comprobarSitio(sitioFalso, 'a.b~c-d_e', {
    fetchImpl: async (u) => {
      urlPedida = u;
      return new Response('{"id": 1}', { status: 200 });
    },
  });
  comprobar(
    'la URL se construye con el alias interpolado',
    urlPedida,
    'https://ejemplo.test/u/a.b~c-d_e'
  );

  // --- Resultado --------------------------------------------------------
  console.log(`\nSitios en el catálogo: ${sitios.length}`);
  console.log(`  sin cadena de comprobación en "existe": ${sinCadenaExiste}`);
  console.log(`  con el mismo código para existe y no existe: ${codigosIguales}`);
  console.log(`  reglas que no discriminan (código igual y sin cadena): ${ambiguos}`);
  console.log(`\nComprobaciones pasadas: ${pasadas}`);

  if (fallos.length) {
    console.log(`Fallos: ${fallos.length}\n`);
    for (const f of fallos.slice(0, 30)) console.log('  ✗', f);
    if (fallos.length > 30) console.log(`  ...y ${fallos.length - 30} más`);
    process.exit(1);
  }
  console.log('Fallos: 0\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
