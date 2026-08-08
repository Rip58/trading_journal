'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const PASOS = ['Identidad', 'Nombre', 'Contacto', 'Confirmar'];

const VACIO = {
  emails: '',
  alias: '',
  nombre: '',
  ciudad: '',
  telefono: '',
  dominios: '',
  incluirSensibles: false,
  titularidadAceptada: false,
};

function Campo({ etiqueta, ayuda, children }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{etiqueta}</span>
      {ayuda && (
        <span className="mt-1 block text-xs leading-relaxed text-(--color-texto-tenue)">
          {ayuda}
        </span>
      )}
      <div className="mt-2">{children}</div>
    </label>
  );
}

const claseEntrada =
  'w-full rounded-lg border border-(--color-borde) bg-(--color-superficie) px-3 py-2.5 ' +
  'text-(--color-texto) placeholder:text-(--color-texto-tenue) ' +
  'focus:border-(--color-acento) focus:outline-none';

export default function Analizar() {
  const router = useRouter();
  const [paso, setPaso] = useState(0);
  const [form, setForm] = useState(VACIO);
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Hace falta al menos un identificador. Sin esto el escaneo no busca nada y
  // el informe saldría vacío, que parece una buena noticia y no lo es.
  const hayAlgo = Boolean(
    form.emails.trim() || form.alias.trim() || form.nombre.trim() || form.dominios.trim()
  );

  async function enviar() {
    if (!form.titularidadAceptada) {
      setAviso('Confirma que los datos que has puesto son tuyos.');
      return;
    }
    if (!hayAlgo) {
      setAviso('Necesito al menos un dato para poder buscar.');
      return;
    }
    setAviso('');
    setEnviando(true);
    try {
      const res = await fetch('/api/escaneo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const datos = await res.json();
      if (!res.ok) {
        setAviso(datos.error ?? 'No se pudo iniciar el análisis.');
        setEnviando(false);
        return;
      }
      router.push(`/escaneo/${datos.token}`);
    } catch {
      setAviso('No se pudo conectar. Revisa tu conexión e inténtalo otra vez.');
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <Link
        href="/"
        className="font-mono text-xs tracking-widest text-(--color-texto-tenue) uppercase hover:text-(--color-texto-suave)"
      >
        ← Huella Digital
      </Link>

      <ol className="mt-8 flex gap-2" aria-label="Progreso del cuestionario">
        {PASOS.map((p, i) => (
          <li key={p} className="flex-1">
            <div
              className={`h-1 rounded-full ${
                i <= paso ? 'bg-(--color-acento)' : 'bg-(--color-borde)'
              }`}
            />
            <span
              className={`mt-2 block text-xs ${
                i === paso ? 'text-(--color-texto)' : 'text-(--color-texto-tenue)'
              }`}
            >
              {p}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-10 space-y-6">
        {paso === 0 && (
          <>
            <h1 className="text-2xl font-semibold">¿Con qué te identificas online?</h1>
            <p className="text-sm leading-relaxed text-(--color-texto-suave)">
              Lo más útil es el alias: es lo que permite buscar tu perfil en 150
              sitios. Puedes poner varios separados por comas.
            </p>
            <Campo
              etiqueta="Alias de usuario"
              ayuda="Los nombres con los que te registras. Letras, números y . _ - ~"
            >
              <input
                className={claseEntrada}
                placeholder="mialias, otroalias"
                value={form.alias}
                onChange={(e) => set('alias', e.target.value)}
              />
            </Campo>
            <Campo etiqueta="Correos electrónicos" ayuda="Incluye los antiguos que ya no uses.">
              <input
                className={claseEntrada}
                type="text"
                placeholder="tucorreo@ejemplo.com"
                value={form.emails}
                onChange={(e) => set('emails', e.target.value)}
              />
            </Campo>
          </>
        )}

        {paso === 1 && (
          <>
            <h1 className="text-2xl font-semibold">¿Cómo te llamas?</h1>
            <p className="text-sm leading-relaxed text-(--color-texto-suave)">
              Sirve para generar búsquedas dirigidas y localizar brokers de datos
              españoles. Es opcional, y da más falsos positivos que el alias.
            </p>
            <Campo etiqueta="Nombre y apellidos">
              <input
                className={claseEntrada}
                placeholder="Nombre Apellido"
                value={form.nombre}
                onChange={(e) => set('nombre', e.target.value)}
              />
            </Campo>
            <Campo etiqueta="Ciudad" ayuda="Acota las búsquedas y reduce el ruido.">
              <input
                className={claseEntrada}
                placeholder="Madrid"
                value={form.ciudad}
                onChange={(e) => set('ciudad', e.target.value)}
              />
            </Campo>
          </>
        )}

        {paso === 2 && (
          <>
            <h1 className="text-2xl font-semibold">Teléfono y dominios</h1>
            <p className="text-sm leading-relaxed text-(--color-texto-suave)">
              Ambos opcionales. Si tienes dominios a tu nombre, se comprueba si
              exponen tus datos personales en el registro público.
            </p>
            <Campo etiqueta="Teléfono">
              <input
                className={claseEntrada}
                placeholder="+34 600 000 000"
                value={form.telefono}
                onChange={(e) => set('telefono', e.target.value)}
              />
            </Campo>
            <Campo etiqueta="Dominios propios">
              <input
                className={claseEntrada}
                placeholder="midominio.com"
                value={form.dominios}
                onChange={(e) => set('dominios', e.target.value)}
              />
            </Campo>
          </>
        )}

        {paso === 3 && (
          <>
            <h1 className="text-2xl font-semibold">Antes de empezar</h1>

            <div className="rounded-lg border border-(--color-borde) bg-(--color-superficie) p-4 text-sm">
              <p className="text-(--color-texto-suave)">Se va a buscar:</p>
              <ul className="mt-2 space-y-1 font-mono text-xs">
                {form.alias.trim() && <li>alias · {form.alias}</li>}
                {form.emails.trim() && <li>correo · {form.emails}</li>}
                {form.nombre.trim() && <li>nombre · {form.nombre}</li>}
                {form.telefono.trim() && <li>teléfono · {form.telefono}</li>}
                {form.dominios.trim() && <li>dominio · {form.dominios}</li>}
              </ul>
            </div>

            <label className="flex cursor-pointer gap-3 rounded-lg border border-(--color-borde) bg-(--color-superficie) p-4">
              <input
                type="checkbox"
                className="mt-0.5 accent-(--color-acento)"
                checked={form.titularidadAceptada}
                onChange={(e) => set('titularidadAceptada', e.target.checked)}
              />
              <span className="text-sm leading-relaxed">
                Confirmo que estos datos son míos y que analizo mi propia huella
                digital.
                <span className="mt-1 block text-xs text-(--color-texto-tenue)">
                  Esta herramienta es para analizarte a ti, no a otras personas.
                </span>
              </span>
            </label>

            <label className="flex cursor-pointer gap-3 rounded-lg border border-(--color-borde) bg-(--color-superficie) p-4">
              <input
                type="checkbox"
                className="mt-0.5 accent-(--color-acento)"
                checked={form.incluirSensibles}
                onChange={(e) => set('incluirSensibles', e.target.checked)}
              />
              <span className="text-sm leading-relaxed">
                Incluir sitios para adultos y de citas
                <span className="mt-1 block text-xs text-(--color-texto-tenue)">
                  Desactivado por defecto. Son 50 sitios más.
                </span>
              </span>
            </label>
          </>
        )}

        {aviso && (
          <p role="alert" className="text-sm text-(--color-critico)">
            {aviso}
          </p>
        )}

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={() => setPaso((p) => Math.max(0, p - 1))}
            disabled={paso === 0}
            className="rounded-lg px-4 py-2.5 text-sm text-(--color-texto-suave) hover:text-(--color-texto) disabled:invisible"
          >
            Atrás
          </button>

          {paso < PASOS.length - 1 ? (
            <button
              type="button"
              onClick={() => setPaso((p) => p + 1)}
              className="rounded-lg bg-(--color-superficie-alta) px-6 py-2.5 text-sm font-medium hover:bg-(--color-borde)"
            >
              Siguiente
            </button>
          ) : (
            <button
              type="button"
              onClick={enviar}
              disabled={enviando}
              className="rounded-lg bg-(--color-acento) px-6 py-2.5 text-sm font-medium text-(--color-fondo) hover:opacity-90 disabled:opacity-50"
            >
              {enviando ? 'Iniciando…' : 'Empezar análisis'}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
