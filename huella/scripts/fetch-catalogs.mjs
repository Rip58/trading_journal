#!/usr/bin/env node
/**
 * Descarga y prepara los catálogos que alimentan el escaneo y el motor de bajas.
 *
 *   node scripts/fetch-catalogs.mjs
 *
 * Produce en data/:
 *   sitios.json          catálogo de detección (WhatsMyName, filtrado y puntuado)
 *   servicios.json       catálogo de bajas (JustDeleteMe, recortado)
 *   servicios-indice.json  dominio registrable -> índice en servicios.json
 *   ATRIBUCIONES.md      licencias, que son obligatorias en ambos datasets
 *
 * Los catálogos se versionan en git a propósito: el build no debe depender de
 * que dos repos de terceros estén disponibles, y así un cambio aguas arriba se
 * ve como diff en la revisión en vez de colarse en producción sin avisar.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR_DATOS = join(RAIZ, 'data');

const FUENTE_WMN =
  'https://raw.githubusercontent.com/WebBreacher/WhatsMyName/main/wmn-data.json';
const FUENTE_JDM =
  'https://raw.githubusercontent.com/jdm-contrib/jdm/master/_data/sites.json';

/** Categorías que se excluyen salvo que el usuario las active explícitamente. */
const CATEGORIAS_SENSIBLES = new Set(['xx NSFW xx', 'dating']);

/**
 * Protecciones que sí se pueden sortear y no justifican descartar el sitio.
 * `user-agent` solo significa que hay que mandar una cabecera decente, cosa que
 * el escáner hace igualmente. Descartarlo a ciegas dejaba fuera GitHub entero,
 * que es de los sitios con más señal de todo el catálogo.
 * El resto (captcha, cloudflare, ddos-guard, cloudfront, anubis) sí bloquea
 * desde IPs de datacenter y solo generaría "no concluyente".
 */
const PROTECCIONES_TOLERABLES = new Set(['user-agent']);

/**
 * Peso por categoría para elegir el subconjunto del nivel gratis.
 * Las redes sociales y el código exponen identidad real; los hobbies, mucho menos.
 */
const PESO_CATEGORIA = {
  social: 10,
  coding: 8,
  tech: 7,
  business: 7,
  finance: 7,
  images: 6,
  video: 6,
  music: 5,
  blog: 5,
  shopping: 5,
  gaming: 4,
  news: 4,
  art: 3,
  health: 3,
  political: 3,
  hobby: 2,
  misc: 2,
  archived: 1,
};

/**
 * Plataformas que casi todo el mundo en España ha tocado alguna vez. WhatsMyName
 * no trae señal de popularidad, y sin esto el nivel gratis se llena de foros
 * rusos oscuros mientras se deja fuera Instagram.
 */
const MUY_CONOCIDOS = new Set(
  [
    'GitHub', 'GitLab', 'Instagram', 'X', 'Twitter', 'Facebook', 'TikTok',
    'Reddit', 'LinkedIn', 'YouTube', 'Pinterest', 'Tumblr', 'Twitch',
    'Spotify', 'SoundCloud', 'Vimeo', 'Flickr', 'Medium', 'Telegram',
    'Steam', 'Xbox Gamertag', 'PlayStation Network', 'Roblox', 'Discord',
    'Etsy', 'eBay', 'Patreon', 'Kickstarter', 'Behance', 'Dribbble',
    'DeviantArt', 'Wattpad', 'Goodreads', 'Duolingo', 'Strava', 'Chess.com',
    'Last.fm', 'Bandcamp', 'Mixcloud', 'Slideshare', 'Scribd', 'Quora',
    'StackOverflow', 'Stack Overflow', 'Docker Hub', 'npm', 'PyPI',
    'HackerNews', 'Hacker News', 'Keybase', 'Gravatar', 'WordPress',
    'Blogger', 'Trello', 'Vero', 'VK', 'Mastodon', 'Bluesky', 'Snapchat',
    'Venmo', 'Cash App', 'Bitbucket', 'Codepen', 'CodePen', 'Replit',
    'Kaggle', 'HackerRank', 'Freelancer', 'Fiverr', 'Upwork', 'Airbnb',
    'Booking.com', 'TripAdvisor', 'Untappd', 'MyAnimeList', 'IMDb',
    'Letterboxd', 'Giphy', 'Imgur', 'Wikipedia', 'Archive.org',
  ].map((n) => n.toLowerCase())
);

/** Cuántos sitios entran en el escaneo gratis. Sube el tiempo linealmente. */
const TOPE_GRATIS = 150;

/** Campos de JustDeleteMe que realmente usamos. El resto son 30 traducciones. */
const CAMPOS_JDM = [
  'name', 'url', 'url_es', 'difficulty', 'notes', 'notes_es',
  'domains', 'email', 'email_subject', 'email_body',
];

async function descargarJson(url, etiqueta) {
  process.stdout.write(`  descargando ${etiqueta}... `);
  const res = await fetch(url, { headers: { 'user-agent': 'huella-digital/0.1' } });
  if (!res.ok) throw new Error(`${etiqueta}: HTTP ${res.status}`);
  const datos = await res.json();
  console.log('ok');
  return datos;
}

/**
 * Reduce un host a su dominio registrable para poder cruzar los dos catálogos.
 *
 * Es deliberadamente ingenuo (dos últimas etiquetas) salvo por una lista de
 * sufijos de dos niveles. La alternativa correcta es la Public Suffix List, que
 * son 200 KB más para ganar unos pocos emparejamientos; si algún día falla un
 * dominio concreto, se añade aquí.
 */
const SUFIJOS_DOBLES = new Set([
  'co.uk', 'org.uk', 'me.uk', 'com.au', 'com.br', 'com.mx', 'com.ar',
  'co.jp', 'co.nz', 'co.za', 'com.tr', 'com.cn', 'co.in', 'com.pl',
]);

export function dominioRegistrable(host) {
  if (!host) return '';
  let h = String(host).toLowerCase().trim().replace(/^\.+|\.+$/g, '');
  if (h.startsWith('www.')) h = h.slice(4);
  const partes = h.split('.');
  if (partes.length < 2) return h;
  const dosUltimas = partes.slice(-2).join('.');
  if (SUFIJOS_DOBLES.has(dosUltimas) && partes.length >= 3) {
    return partes.slice(-3).join('.');
  }
  return dosUltimas;
}

function hostDe(uri) {
  try {
    return new URL(uri.replace('{account}', 'x')).hostname;
  } catch {
    return '';
  }
}

/**
 * WhatsMyName desambigua con sufijos entre paréntesis — "GitHub (User)",
 * "Discord (Invite)", "WordPress.com (Public)". Compararlos tal cual contra la
 * lista de conocidos dejaba fuera media docena de las plataformas más grandes,
 * así que se compara contra el nombre sin el paréntesis.
 */
function nombreBase(nombre) {
  return nombre.replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase();
}

function esMuyConocido(nombre) {
  const base = nombreBase(nombre);
  if (MUY_CONOCIDOS.has(base)) return true;
  // "WordPress.com" y "YouTube Channel" deben casar con "WordPress" y "YouTube".
  return [...MUY_CONOCIDOS].some(
    (c) =>
      c.length >= 4 &&
      (base === c || base.startsWith(`${c}.`) || base.startsWith(`${c} `))
  );
}

/** Puntúa un sitio para decidir si entra en el escaneo gratis. */
function puntuar(sitio, tieneBaja) {
  let p = PESO_CATEGORIA[sitio.cat] ?? 2;
  if (esMuyConocido(sitio.name)) p += 25;
  // Si sabemos cómo borrarte de ahí, el hallazgo es accionable y vale más.
  if (tieneBaja) p += 6;
  return p;
}

async function main() {
  console.log('Catálogos de Huella Digital\n');

  const [wmn, jdm] = await Promise.all([
    descargarJson(FUENTE_WMN, 'WhatsMyName'),
    descargarJson(FUENTE_JDM, 'JustDeleteMe'),
  ]);

  // --- Catálogo de bajas -----------------------------------------------
  const servicios = jdm.map((e) => {
    const recorte = {};
    for (const c of CAMPOS_JDM) if (e[c]) recorte[c] = e[c];
    return recorte;
  });

  // dominio -> posición en servicios[]. Guardamos el índice y no el objeto para
  // no duplicar en disco los servicios que tienen varios dominios.
  const indiceServicios = {};
  servicios.forEach((s, i) => {
    for (const d of s.domains ?? []) {
      const reg = dominioRegistrable(d);
      if (reg && !(reg in indiceServicios)) indiceServicios[reg] = i;
    }
  });

  // --- Catálogo de detección -------------------------------------------
  let descartadosProteccion = 0;
  let descartadosSensibles = 0;

  let descartadosInvalidos = 0;

  const sitios = [];
  for (const s of wmn.sites) {
    // El dataset marca así las entradas cuya detección está rota.
    if (s.valid === false) {
      descartadosInvalidos++;
      continue;
    }
    // Sitios tras captcha o Cloudflare: desde un datacenter solo dan ruido.
    const bloqueantes = (s.protection ?? []).filter(
      (p) => !PROTECCIONES_TOLERABLES.has(p)
    );
    if (bloqueantes.length) {
      descartadosProteccion++;
      continue;
    }
    const sensible = CATEGORIAS_SENSIBLES.has(s.cat);
    if (sensible) descartadosSensibles++;

    const host = hostDe(s.uri_check);
    const reg = dominioRegistrable(host);
    const idxBaja = indiceServicios[reg];

    sitios.push({
      nombre: s.name,
      uri: s.uri_check,
      uriBonita: s.uri_pretty || null,
      dominio: reg,
      cat: s.cat,
      sensible,
      eCode: s.e_code,
      eString: s.e_string,
      mCode: s.m_code,
      mString: s.m_string,
      stripBadChar: s.strip_bad_char || null,
      // Imprescindibles: sin esto GitHub, Discord y VK no se pueden comprobar.
      // GitHub necesita User-Agent de navegador; Discord y AniList son POST.
      cabeceras: s.headers || null,
      cuerpoPost: s.post_body || null,
      // Usuarios reales verificados: nuestro banco de pruebas para medir precisión.
      conocidos: s.known ?? [],
      baja: idxBaja ?? null,
      puntos: puntuar(s, idxBaja !== undefined),
    });
  }

  // El nivel gratis: los mejor puntuados, sin categorías sensibles.
  const candidatosGratis = sitios
    .filter((s) => !s.sensible)
    .sort((a, b) => b.puntos - a.puntos);
  const gratis = new Set(candidatosGratis.slice(0, TOPE_GRATIS).map((s) => s.nombre));
  for (const s of sitios) s.gratis = gratis.has(s.nombre);

  // Orden estable por puntuación: el escaneo procesa los de más señal primero,
  // así los hallazgos interesantes aparecen pronto en pantalla.
  sitios.sort((a, b) => b.puntos - a.puntos || a.nombre.localeCompare(b.nombre));

  const conBaja = sitios.filter((s) => s.baja !== null).length;

  await mkdir(DIR_DATOS, { recursive: true });
  await Promise.all([
    writeFile(join(DIR_DATOS, 'sitios.json'), JSON.stringify(sitios)),
    writeFile(join(DIR_DATOS, 'servicios.json'), JSON.stringify(servicios)),
    writeFile(join(DIR_DATOS, 'servicios-indice.json'), JSON.stringify(indiceServicios)),
    writeFile(join(DIR_DATOS, 'ATRIBUCIONES.md'), ATRIBUCIONES),
  ]);

  console.log(`
Detección (sitios.json)
  ${sitios.length} sitios escaneables
  ${descartadosProteccion} descartados por captcha/Cloudflare
  ${descartadosInvalidos} descartados por venir marcados como no válidos
  ${descartadosSensibles} marcados como sensibles (NSFW/dating, desactivados por defecto)
  ${gratis.size} en el nivel gratis

Bajas (servicios.json)
  ${servicios.length} servicios
  ${Object.keys(indiceServicios).length} dominios indexados

Cruce
  ${conBaja}/${sitios.length} sitios (${Math.round((conBaja / sitios.length) * 100)}%) tienen instrucciones de baja
  El resto usa carta RGPD genérica a privacy@/dpo@ del dominio
`);
}

const ATRIBUCIONES = `# Atribuciones

Los catálogos de \`data/\` derivan de dos proyectos abiertos. Ambas licencias
obligan a conservar estos avisos.

## WhatsMyName — \`sitios.json\`

Copyright (C) Micah Hoffman y colaboradores.
https://github.com/WebBreacher/WhatsMyName

Licenciado bajo **Creative Commons Attribution-ShareAlike 4.0 International**
(CC BY-SA 4.0): http://creativecommons.org/licenses/by-sa/4.0/

\`sitios.json\` es **obra derivada** del dataset original: se filtra, se renombran
campos y se añade puntuación. La cláusula *ShareAlike* obliga a distribuir esa
obra derivada bajo la misma licencia. En la práctica: \`data/sitios.json\` es
CC BY-SA 4.0 y debe permanecer disponible bajo esos términos, también si la
aplicación que lo usa es comercial. El código de la aplicación es obra
independiente y no queda contagiado por la licencia.

## JustDeleteMe — \`servicios.json\`

The MIT License (MIT)
Copyright (c) 2013-2020 Robb Lewis, The JDM Contrib Team, y colaboradores.
https://github.com/jdm-contrib/jdm

Se concede permiso, libre de cargo, a cualquier persona que obtenga una copia de
este software y los archivos de documentación asociados, para operar con ellos
sin restricción, incluyendo sin limitación los derechos de uso, copia,
modificación, fusión, publicación, distribución, sublicencia y/o venta de copias.

El aviso de copyright anterior y este aviso de permiso deben incluirse en todas
las copias o porciones sustanciales del software.
`;

main().catch((err) => {
  console.error('\nFallo al preparar los catálogos:', err.message);
  process.exit(1);
});
