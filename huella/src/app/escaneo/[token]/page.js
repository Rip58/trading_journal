'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Orquesta el escaneo desde el cliente, pidiendo tandas sucesivas.
 *
 * Que sea el cliente quien lleva el ritmo no es un capricho: mantiene cada
 * petición muy por debajo del límite de ejecución de Vercel, permite reanudar
 * por desplazamiento si se cierra la pestaña, y da progreso real en vez de una
 * barra decorativa que avanza sola.
 */
export default function Progreso({ params }) {
  // Next 16: params es una promesa, y `use` la desenvuelve en el cliente.
  const { token } = use(params);
  const router = useRouter();

  const [estado, setEstado] = useState({ hechos: 0, total: 0 });
  const [encontrados, setEncontrados] = useState(0);
  const [error, setError] = useState('');
  const cancelado = useRef(false);

  useEffect(() => {
    cancelado.current = false;

    async function correr() {
      let desplazamiento = 0;
      let hallados = 0;

      while (!cancelado.current) {
        let res;
        try {
          res = await fetch(`/api/escaneo/${token}/tanda`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ desplazamiento }),
          });
        } catch {
          setError('Se perdió la conexión. Recarga para continuar donde iba.');
          return;
        }

        if (!res.ok) {
          setError(
            res.status === 404
              ? 'Este análisis no existe o ha caducado.'
              : 'Algo falló durante el análisis.'
          );
          return;
        }

        const t = await res.json();
        hallados += t.encontrados;
        desplazamiento = t.desplazamiento;

        setEstado({ hechos: t.desplazamiento, total: t.total });
        setEncontrados(hallados);

        if (t.terminado) {
          router.replace(`/escaneo/${token}/informe`);
          return;
        }
      }
    }

    correr();
    return () => {
      cancelado.current = true;
    };
  }, [token, router]);

  const pct = estado.total ? Math.round((estado.hechos / estado.total) * 100) : 0;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-12">
      <p className="font-mono text-xs tracking-widest text-(--color-acento) uppercase">
        Analizando
      </p>
      <h1 className="mt-3 text-2xl font-semibold">Buscando tu rastro</h1>
      <p className="mt-2 text-sm leading-relaxed text-(--color-texto-suave)">
        Comprobando tus alias en los sitios donde más gente deja cuenta. Puedes
        dejar esta pestaña abierta.
      </p>

      <div className="mt-8">
        <div
          className="h-2 overflow-hidden rounded-full bg-(--color-superficie-alta)"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-(--color-acento) transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-3 flex justify-between font-mono text-xs text-(--color-texto-tenue)">
          <span>
            {estado.hechos} / {estado.total || '…'} comprobaciones
          </span>
          <span>{pct}%</span>
        </div>
      </div>

      {encontrados > 0 && (
        <p className="mt-8 text-sm">
          <span className="font-mono text-lg text-(--color-acento)">{encontrados}</span>{' '}
          <span className="text-(--color-texto-suave)">
            {encontrados === 1 ? 'cuenta encontrada' : 'cuentas encontradas'} hasta ahora
          </span>
        </p>
      )}

      {error && (
        <p role="alert" className="mt-8 text-sm text-(--color-critico)">
          {error}
        </p>
      )}
    </main>
  );
}
