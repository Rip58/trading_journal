import { randomBytes } from 'node:crypto';
import { db } from './db.js';
import { sitiosParaEscanear } from './catalogo.js';
import {
  comprobarSitio,
  conConcurrencia,
  aliasEsValido,
  ENCONTRADO,
  NO_CONCLUYENTE,
} from './deteccion.js';

/**
 * Cuántas comprobaciones por petición. Vercel corta a 300s (Hobby) / 800s
 * (Pro); con 40 unidades a concurrencia 10 y 6s de tope cada una, el peor caso
 * ronda los 24s. Margen de sobra, y el cliente puede reanudar por desplazamiento
 * si se cierra el navegador a mitad.
 */
export const TAMANO_TANDA = 40;
const CONCURRENCIA = 10;

/**
 * Severidad de una cuenta encontrada. No todo hallazgo pesa igual: una cuenta
 * en un sitio financiero o de salud expone bastante más que una de música.
 */
const SEVERIDAD_POR_CATEGORIA = {
  finance: 'ALTA',
  health: 'ALTA',
  dating: 'ALTA',
  'xx NSFW xx': 'CRITICA',
  political: 'ALTA',
  business: 'MEDIA',
  social: 'MEDIA',
  coding: 'MEDIA',
  tech: 'MEDIA',
};

function severidadDe(sitio) {
  return SEVERIDAD_POR_CATEGORIA[sitio.cat] ?? 'BAJA';
}

export function nuevoToken() {
  return randomBytes(18).toString('base64url');
}

/**
 * Normaliza lo que llega del cuestionario. Devuelve los identificadores que se
 * van a escanear, ya deduplicados, junto con los que se han descartado y por qué
 * — la interfaz los muestra, porque un alias silenciosamente ignorado es peor
 * que uno rechazado con explicación.
 */
export function normalizarEntrada(cuerpo) {
  const limpiar = (v) =>
    (Array.isArray(v) ? v : String(v ?? '').split(/[\s,;]+/))
      .map((x) => String(x).trim())
      .filter(Boolean);

  const identificadores = [];
  const descartados = [];
  const vistos = new Set();

  const anadir = (tipo, valor) => {
    const clave = `${tipo}:${valor.toLowerCase()}`;
    if (vistos.has(clave)) return;
    vistos.add(clave);
    identificadores.push({ tipo, valor });
  };

  for (const e of limpiar(cuerpo.emails)) {
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) anadir('EMAIL', e.toLowerCase());
    else descartados.push({ valor: e, motivo: 'no parece un email' });
  }

  for (const a of limpiar(cuerpo.alias)) {
    if (aliasEsValido(a)) anadir('ALIAS', a);
    else
      descartados.push({
        valor: a,
        motivo: 'solo se admiten letras, números y . _ - ~',
      });
  }

  for (const d of limpiar(cuerpo.dominios)) {
    const limpio = d.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(limpio)) anadir('DOMINIO', limpio);
    else descartados.push({ valor: d, motivo: 'no parece un dominio' });
  }

  const nombre = String(cuerpo.nombre ?? '').trim();
  if (nombre) anadir('NOMBRE', nombre);

  const telefono = String(cuerpo.telefono ?? '').trim();
  if (telefono) anadir('TELEFONO', telefono);

  return { identificadores, descartados };
}

/**
 * Crea el escaneo y sus identificadores. No lanza ninguna comprobación: de eso
 * se encargan las tandas que pide el cliente.
 */
export async function crearEscaneo({ entrada, nivel = 'GRATIS' }) {
  const { identificadores, descartados } = normalizarEntrada(entrada);

  const alias = identificadores.filter((i) => i.tipo === 'ALIAS');
  const sitios = await sitiosParaEscanear({
    nivel,
    incluirSensibles: Boolean(entrada.incluirSensibles),
  });

  const escaneo = await db.escaneo.create({
    data: {
      token: nuevoToken(),
      nivel,
      sitiosTotal: sitios.length * alias.length,
      sujeto: {
        create: {
          emails: identificadores.filter((i) => i.tipo === 'EMAIL').map((i) => i.valor),
          alias: alias.map((i) => i.valor),
          nombre: identificadores.find((i) => i.tipo === 'NOMBRE')?.valor ?? null,
          telefono: identificadores.find((i) => i.tipo === 'TELEFONO')?.valor ?? null,
          dominios: identificadores.filter((i) => i.tipo === 'DOMINIO').map((i) => i.valor),
          titularidadAceptada: Boolean(entrada.titularidadAceptada),
          incluirSensibles: Boolean(entrada.incluirSensibles),
        },
      },
      identificadores: {
        create: identificadores.map((i) => ({ tipo: i.tipo, valor: i.valor })),
      },
    },
    include: { identificadores: true },
  });

  return { escaneo, descartados };
}

/**
 * Ejecuta una tanda de comprobaciones de alias.
 *
 * El espacio de trabajo es el producto (sitios x alias), recorrido linealmente,
 * de forma que un desplazamiento identifica siempre la misma unidad de trabajo
 * y la tanda es idempotente si se repite.
 */
export async function ejecutarTanda({ token, desplazamiento }) {
  const escaneo = await db.escaneo.findUnique({
    where: { token },
    include: { sujeto: true, identificadores: true },
  });
  if (!escaneo) return null;

  const sitios = await sitiosParaEscanear({
    nivel: escaneo.nivel,
    incluirSensibles: escaneo.sujeto.incluirSensibles,
  });
  const alias = escaneo.identificadores.filter((i) => i.tipo === 'ALIAS');

  const total = sitios.length * alias.length;
  const desde = Math.max(0, Number(desplazamiento) || 0);
  const hasta = Math.min(desde + TAMANO_TANDA, total);

  if (desde === 0) {
    await db.escaneo.update({
      where: { id: escaneo.id },
      data: { estado: 'EN_CURSO', sitiosTotal: total },
    });
  }

  // Deshaz el índice lineal en (alias, sitio).
  const unidades = [];
  for (let i = desde; i < hasta; i++) {
    unidades.push({
      alias: alias[Math.floor(i / sitios.length)],
      sitio: sitios[i % sitios.length],
    });
  }

  const resultados = await conConcurrencia(unidades, CONCURRENCIA, async (u) => {
    const r = await comprobarSitio(u.sitio, u.alias.valor);
    return { ...u, ...r };
  });

  // Solo se persiste lo accionable. Guardar los NO_ENCONTRADO serían cientos de
  // filas por alias que nadie va a mirar nunca.
  const aGuardar = resultados
    .filter((r) => r.confianza === ENCONTRADO || r.confianza === NO_CONCLUYENTE)
    .map((r) => ({
      escaneoId: escaneo.id,
      identificadorId: r.alias.id,
      tipo: 'CUENTA',
      fuente: 'whatsmyname',
      nombre: r.sitio.nombre,
      url: r.url ?? null,
      dominio: r.sitio.dominio,
      confianza: r.confianza,
      severidad: r.confianza === ENCONTRADO ? severidadDe(r.sitio) : 'BAJA',
      datos: {
        categoria: r.sitio.cat,
        alias: r.alias.valor,
        indiceBaja: r.sitio.baja,
        ...(r.motivo ? { motivo: r.motivo } : {}),
        ...(r.estado ? { estadoHttp: r.estado } : {}),
      },
    }));

  if (aGuardar.length) {
    await db.hallazgo.createMany({ data: aGuardar, skipDuplicates: true });
  }

  const hechos = hasta;
  const terminado = hasta >= total;
  await db.escaneo.update({
    where: { id: escaneo.id },
    data: {
      sitiosHechos: hechos,
      ...(terminado ? { estado: 'COMPLETADO' } : {}),
    },
  });

  return {
    desplazamiento: hasta,
    total,
    terminado,
    encontrados: resultados.filter((r) => r.confianza === ENCONTRADO).length,
    noConcluyentes: resultados.filter((r) => r.confianza === NO_CONCLUYENTE).length,
  };
}
