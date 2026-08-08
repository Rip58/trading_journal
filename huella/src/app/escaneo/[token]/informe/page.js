import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { bajaPorIndice } from '@/lib/catalogo';

export const dynamic = 'force-dynamic';

const COLOR_SEVERIDAD = {
  CRITICA: 'var(--color-critico)',
  ALTA: 'var(--color-alto)',
  MEDIA: 'var(--color-medio)',
  BAJA: 'var(--color-bajo)',
};

const ETIQUETA_DIFICULTAD = {
  easy: 'fácil',
  medium: 'media',
  hard: 'difícil',
  impossible: 'no se puede',
  limited: 'limitada',
};

export default async function Informe({ params }) {
  const { token } = await params;

  const escaneo = await db.escaneo.findUnique({
    where: { token },
    include: {
      sujeto: true,
      hallazgos: { orderBy: [{ severidad: 'asc' }, { nombre: 'asc' }] },
    },
  });
  if (!escaneo) notFound();

  const encontrados = escaneo.hallazgos.filter((h) => h.confianza === 'ENCONTRADO');
  const noConcluyentes = escaneo.hallazgos.filter(
    (h) => h.confianza === 'NO_CONCLUYENTE'
  );

  // Se resuelven las instrucciones de baja aquí, en el servidor: el catálogo son
  // 736 KB que no tienen por qué viajar al navegador.
  const conBaja = await Promise.all(
    encontrados.map(async (h) => ({
      ...h,
      baja: await bajaPorIndice(h.datos?.indiceBaja),
    }))
  );

  const borrables = conBaja.filter((h) => h.baja).length;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link
        href="/"
        className="font-mono text-xs tracking-widest text-(--color-texto-tenue) uppercase hover:text-(--color-texto-suave)"
      >
        ← Huella Digital
      </Link>

      <h1 className="mt-8 text-3xl font-semibold tracking-tight">Tu informe</h1>

      <div className="mt-8 grid gap-px overflow-hidden rounded-xl border border-(--color-borde) bg-(--color-borde) sm:grid-cols-3">
        <Metrica valor={encontrados.length} etiqueta="cuentas encontradas" destacado />
        <Metrica valor={borrables} etiqueta="con instrucciones de baja" />
        <Metrica valor={noConcluyentes.length} etiqueta="sin poder comprobar" />
      </div>

      {encontrados.length === 0 ? (
        <p className="mt-10 rounded-xl border border-(--color-borde) bg-(--color-superficie) p-6 text-sm leading-relaxed text-(--color-texto-suave)">
          No se encontró ninguna cuenta con los alias que diste. Eso es buena
          señal, pero no una garantía: el análisis gratis cubre 150 sitios, y hay
          plataformas grandes —LinkedIn entre ellas— que bloquean cualquier
          comprobación automática.
        </p>
      ) : (
        <section className="mt-10">
          <h2 className="text-sm font-medium tracking-wide text-(--color-texto-suave) uppercase">
            Cuentas encontradas
          </h2>
          <ul className="mt-4 space-y-2">
            {conBaja.map((h) => (
              <li
                key={h.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-(--color-borde) bg-(--color-superficie) p-4"
              >
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: COLOR_SEVERIDAD[h.severidad] }}
                />
                <span className="font-medium">{h.nombre}</span>
                <span className="font-mono text-xs text-(--color-texto-tenue)">
                  {h.datos?.alias}
                </span>

                <span className="ml-auto flex items-center gap-3">
                  {h.baja ? (
                    <a
                      href={h.baja.url_es || h.baja.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md bg-(--color-superficie-alta) px-3 py-1.5 text-xs hover:bg-(--color-borde)"
                    >
                      Darse de baja
                      <span className="ml-1.5 text-(--color-texto-tenue)">
                        {ETIQUETA_DIFICULTAD[h.baja.difficulty] ?? h.baja.difficulty}
                      </span>
                    </a>
                  ) : (
                    <span className="text-xs text-(--color-texto-tenue)">
                      requiere carta RGPD
                    </span>
                  )}
                  {h.url && (
                    <a
                      href={h.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-(--color-texto-tenue) underline hover:text-(--color-texto-suave)"
                    >
                      ver
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {noConcluyentes.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-medium tracking-wide text-(--color-texto-suave) uppercase">
            Sin poder comprobar
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-(--color-texto-suave)">
            Estos sitios bloquearon la comprobación o respondieron de forma
            ambigua. No significa que no tengas cuenta: significa que no se pudo
            saber, y conviene mirarlos a mano.
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {noConcluyentes.slice(0, 60).map((h) => (
              <li
                key={h.id}
                className="rounded-md border border-(--color-borde-suave) bg-(--color-superficie) px-2.5 py-1 text-xs text-(--color-texto-tenue)"
                title={h.datos?.motivo ?? `HTTP ${h.datos?.estadoHttp ?? '?'}`}
              >
                {h.nombre}
              </li>
            ))}
            {noConcluyentes.length > 60 && (
              <li className="px-2.5 py-1 text-xs text-(--color-texto-tenue)">
                y {noConcluyentes.length - 60} más
              </li>
            )}
          </ul>
        </section>
      )}

      {/*
        El bloque de pago dice qué se encontraría, no un contador borroso. Lo
        que se reserva es el detalle accionable, no la existencia del problema.
      */}
      <section className="mt-12 rounded-xl border border-(--color-acento-tenue) bg-(--color-superficie) p-6">
        <h2 className="font-medium">Análisis profundo</h2>
        <p className="mt-3 text-sm leading-relaxed text-(--color-texto-suave)">
          El análisis gratis cubre 150 sitios y no toca filtraciones de datos. El
          profundo amplía a 664 sitios, te dice en qué brechas concretas aparece
          tu correo y qué datos tuyos se expusieron en cada una, y busca los
          alias y correos antiguos que las filtraciones revelan y que
          probablemente ni recuerdes.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-(--color-texto-suave)">
          Incluye el pack de cartas RGPD y el seguimiento del plazo legal.
        </p>
        <p className="mt-4 font-mono text-xs text-(--color-texto-tenue)">
          Próximamente
        </p>
      </section>
    </main>
  );
}

function Metrica({ valor, etiqueta, destacado }) {
  return (
    <div className="bg-(--color-superficie) p-5">
      <div
        className={`font-mono text-3xl ${destacado ? 'text-(--color-acento)' : ''}`}
      >
        {valor}
      </div>
      <div className="mt-1 text-xs text-(--color-texto-suave)">{etiqueta}</div>
    </div>
  );
}
