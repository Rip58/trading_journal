'use client';

import { useState } from 'react';
import {
  redactarCarta,
  asuntoCarta,
  redactarReclamacionAepd,
  correosProbables,
  enlaceMailto,
  diasRestantes,
  BASES,
} from '@/lib/cartas';

const ETIQUETA_DIFICULTAD = {
  easy: 'fácil',
  medium: 'media',
  hard: 'difícil',
  impossible: 'no se puede',
  limited: 'limitada',
};

const COLOR_SEVERIDAD = {
  CRITICA: 'var(--color-critico)',
  ALTA: 'var(--color-alto)',
  MEDIA: 'var(--color-medio)',
  BAJA: 'var(--color-bajo)',
};

const ESTADOS = {
  PENDIENTE: 'Pendiente',
  ENVIADA: 'Enviada',
  RESPONDIDA: 'Respondida',
  CUMPLIDA: 'Cumplida',
  DENEGADA: 'Denegada',
  VENCIDA: 'Vencida',
};

export default function TableroBajas({ filas, identidad }) {
  // El DNI vive solo aquí, en el estado del componente. No se envía a ninguna
  // API ni se guarda: se interpola en la carta en el momento de copiarla.
  const [dni, setDni] = useState('');
  const [abierta, setAbierta] = useState(null);
  const [estados, setEstados] = useState(() =>
    Object.fromEntries(filas.map((f) => [f.id, f.solicitud?.estado ?? 'PENDIENTE']))
  );
  const [copiado, setCopiado] = useState(null);

  async function marcar(fila, estado) {
    setEstados((e) => ({ ...e, [fila.id]: estado }));
    await fetch('/api/solicitud', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hallazgoId: fila.id,
        servicio: fila.nombre,
        canal: fila.baja?.url ? 'FORMULARIO' : 'EMAIL',
        base: 'ART17',
        estado,
      }),
    }).catch(() => {});
  }

  function cartaDe(fila) {
    return redactarCarta({
      base: 'ART17',
      servicio: fila.nombre,
      nombre: identidad.nombre,
      email: identidad.email,
      dni: dni || undefined,
      identificadores: identidad.identificadores,
    });
  }

  async function copiar(fila) {
    try {
      await navigator.clipboard.writeText(cartaDe(fila));
      setCopiado(fila.id);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setCopiado('error');
    }
  }

  const pendientes = filas.filter((f) => (estados[f.id] ?? 'PENDIENTE') === 'PENDIENTE');
  const enviadas = filas.filter((f) => estados[f.id] === 'ENVIADA');
  const cerradas = filas.filter((f) =>
    ['CUMPLIDA', 'DENEGADA'].includes(estados[f.id])
  );

  return (
    <>
      <div className="mt-8 grid gap-px overflow-hidden rounded-xl border border-(--color-borde) bg-(--color-borde) sm:grid-cols-3">
        <Metrica valor={pendientes.length} etiqueta="pendientes" />
        <Metrica valor={enviadas.length} etiqueta="enviadas, esperando respuesta" />
        <Metrica valor={cerradas.length} etiqueta="cerradas" />
      </div>

      <label className="mt-6 block rounded-xl border border-(--color-borde) bg-(--color-superficie) p-4">
        <span className="text-sm font-medium">Tu DNI o NIE</span>
        <span className="mt-1 block text-xs leading-relaxed text-(--color-texto-tenue)">
          Opcional. Las solicitudes RGPD exigen identificarse, así que si lo pones
          aquí se rellena solo en las cartas. Se queda en este navegador: no se
          envía a ningún servidor ni se guarda en ninguna base de datos. Si lo
          dejas vacío, la carta lleva un hueco que rellenas tú.
        </span>
        <input
          className="mt-2 w-full rounded-lg border border-(--color-borde) bg-(--color-fondo) px-3 py-2 font-mono text-sm focus:border-(--color-acento) focus:outline-none"
          placeholder="12345678Z"
          value={dni}
          onChange={(e) => setDni(e.target.value)}
        />
      </label>

      <ul className="mt-6 space-y-2">
        {filas.map((f) => {
          const estado = estados[f.id] ?? 'PENDIENTE';
          const dias = f.solicitud?.venceEn ? diasRestantes(f.solicitud.venceEn) : null;
          const vencida = dias !== null && dias < 0 && estado === 'ENVIADA';

          return (
            <li
              key={f.id}
              className="rounded-lg border border-(--color-borde) bg-(--color-superficie)"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: COLOR_SEVERIDAD[f.severidad] }}
                />
                <span className="font-medium">{f.nombre}</span>

                {f.baja ? (
                  <span className="text-xs text-(--color-texto-tenue)">
                    baja {ETIQUETA_DIFICULTAD[f.baja.dificultad] ?? f.baja.dificultad}
                  </span>
                ) : (
                  <span className="text-xs text-(--color-texto-tenue)">
                    sin formulario · carta RGPD
                  </span>
                )}

                {estado !== 'PENDIENTE' && (
                  <span
                    className="rounded-md px-2 py-0.5 text-xs"
                    style={{
                      background: vencida
                        ? 'var(--color-critico)'
                        : 'var(--color-superficie-alta)',
                      color: vencida ? 'var(--color-fondo)' : 'var(--color-texto-suave)',
                    }}
                  >
                    {vencida ? 'plazo vencido' : ESTADOS[estado]}
                    {estado === 'ENVIADA' && !vencida && dias !== null && (
                      <span className="ml-1 opacity-70">· quedan {dias} d</span>
                    )}
                  </span>
                )}

                <span className="ml-auto flex flex-wrap items-center gap-2">
                  {f.baja?.url && (
                    <a
                      href={f.baja.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md bg-(--color-superficie-alta) px-3 py-1.5 text-xs hover:bg-(--color-borde)"
                    >
                      Ir al formulario
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setAbierta(abierta === f.id ? null : f.id)}
                    className="rounded-md bg-(--color-superficie-alta) px-3 py-1.5 text-xs hover:bg-(--color-borde)"
                  >
                    {abierta === f.id ? 'Ocultar carta' : 'Ver carta'}
                  </button>
                </span>
              </div>

              {abierta === f.id && (
                <div className="border-t border-(--color-borde-suave) p-4">
                  {f.baja?.notas && (
                    <p className="mb-3 text-xs leading-relaxed text-(--color-texto-suave)">
                      {f.baja.notas}
                    </p>
                  )}

                  <pre className="max-h-72 overflow-auto rounded-lg border border-(--color-borde-suave) bg-(--color-fondo) p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-(--color-texto-suave)">
                    {cartaDe(f)}
                  </pre>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => copiar(f)}
                      className="rounded-md bg-(--color-acento) px-3 py-1.5 text-xs font-medium text-(--color-fondo) hover:opacity-90"
                    >
                      {copiado === f.id ? 'Copiada' : 'Copiar carta'}
                    </button>

                    <a
                      href={enlaceMailto({
                        para: f.baja?.email ?? correosProbables(f.dominio)[0],
                        asunto: asuntoCarta({ base: 'ART17', servicio: f.nombre }),
                        cuerpo: cartaDe(f),
                      })}
                      className="rounded-md bg-(--color-superficie-alta) px-3 py-1.5 text-xs hover:bg-(--color-borde)"
                    >
                      Abrir en mi correo
                    </a>

                    <select
                      value={estado}
                      onChange={(e) => marcar(f, e.target.value)}
                      className="rounded-md border border-(--color-borde) bg-(--color-fondo) px-2 py-1.5 text-xs"
                      aria-label="Estado de la solicitud"
                    >
                      {Object.entries(ESTADOS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>

                  {!f.baja?.email && (
                    <p className="mt-2 text-xs text-(--color-texto-tenue)">
                      No consta dirección de privacidad para este servicio. Se
                      propone {correosProbables(f.dominio)[0]}, que es la
                      convención más habitual; si rebota, prueba con{' '}
                      {correosProbables(f.dominio)[1]}.
                    </p>
                  )}

                  {vencida && (
                    <div className="mt-4 rounded-lg border border-(--color-critico) p-3">
                      <p className="text-xs leading-relaxed text-(--color-texto-suave)">
                        Ha pasado el mes que da el artículo 12.3 del RGPD sin
                        respuesta. Puedes reclamar ante la AEPD.
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          navigator.clipboard.writeText(
                            redactarReclamacionAepd({
                              servicio: f.nombre,
                              nombre: identidad.nombre,
                              email: identidad.email,
                              dni: dni || undefined,
                              enviadaEn: f.solicitud.enviadaEn,
                              base: 'ART17',
                            })
                          )
                        }
                        className="mt-2 rounded-md bg-(--color-critico) px-3 py-1.5 text-xs font-medium text-(--color-fondo)"
                      >
                        Copiar reclamación AEPD
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {filas.length === 0 && (
        <p className="mt-8 rounded-xl border border-(--color-borde) bg-(--color-superficie) p-6 text-sm text-(--color-texto-suave)">
          No hay cuentas encontradas de las que darse de baja.
        </p>
      )}

      <p className="mt-8 text-xs leading-relaxed text-(--color-texto-tenue)">
        Base legal: {BASES.ART17.articulo} y artículo 15 de la LOPDGDD. El plazo
        de respuesta es de un mes desde que envías la solicitud.
      </p>
    </>
  );
}

function Metrica({ valor, etiqueta }) {
  return (
    <div className="bg-(--color-superficie) p-5">
      <div className="font-mono text-3xl">{valor}</div>
      <div className="mt-1 text-xs text-(--color-texto-suave)">{etiqueta}</div>
    </div>
  );
}
