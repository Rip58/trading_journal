import Link from 'next/link';

const PASOS = [
  {
    n: '01',
    titulo: 'Cuentas olvidadas',
    texto:
      'Ese foro de 2011, la tienda donde compraste una vez. Siguen ahí, con tu correo y a veces con tu dirección.',
  },
  {
    n: '02',
    titulo: 'Filtraciones de datos',
    texto:
      'Cuando una empresa sufre una brecha, tus datos circulan. No te avisan, y la contraseña que usabas entonces quizá la sigas usando.',
  },
  {
    n: '03',
    titulo: 'Brokers de datos',
    texto:
      'Empresas que recopilan y venden perfiles de personas. Nunca les diste permiso; en la UE tienes derecho a que te borren.',
  },
];

export default function Portada() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20 sm:py-28">
      <p className="mb-4 font-mono text-xs tracking-widest text-(--color-acento) uppercase">
        Huella Digital
      </p>

      <h1 className="text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
        Averigua dónde estás
        <br />
        expuesto en internet.
      </h1>

      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-(--color-texto-suave)">
        Con el tiempo todos dejamos rastro: cuentas que abrimos y olvidamos,
        filtraciones de empresas en las que confiamos, y empresas que recopilan
        y venden perfiles de gente sin pedir permiso.
      </p>

      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-(--color-texto-suave)">
        Este análisis busca tu rastro y te dice qué encontró. Después te ayuda a
        borrarlo, ejercitando los derechos que el RGPD ya te da.
      </p>

      <div className="mt-10 flex flex-wrap items-center gap-4">
        <Link
          href="/analizar"
          className="rounded-lg bg-(--color-acento) px-6 py-3 font-medium text-(--color-fondo) transition-opacity hover:opacity-90"
        >
          Analizar mi exposición
        </Link>
        <span className="text-sm text-(--color-texto-tenue)">
          Gratis · sin registro · menos de un minuto
        </span>
      </div>

      <div className="mt-20 grid gap-px overflow-hidden rounded-xl border border-(--color-borde) bg-(--color-borde) sm:grid-cols-3">
        {PASOS.map((p) => (
          <div key={p.n} className="bg-(--color-superficie) p-6">
            <span className="font-mono text-xs text-(--color-texto-tenue)">{p.n}</span>
            <h2 className="mt-3 font-medium">{p.titulo}</h2>
            <p className="mt-2 text-sm leading-relaxed text-(--color-texto-suave)">
              {p.texto}
            </p>
          </div>
        ))}
      </div>

      {/*
        Esta sección existe a propósito. El sector está lleno de servicios que
        prometen borrado en un clic, y eso no existe. Decirlo por adelantado
        cuesta alguna conversión y evita todas las decepciones.
      */}
      <section className="mt-16 rounded-xl border border-(--color-borde) bg-(--color-superficie) p-6">
        <h2 className="font-medium">Lo que esta herramienta no hace</h2>
        <p className="mt-3 text-sm leading-relaxed text-(--color-texto-suave)">
          No te borra de internet con un botón. Nadie puede: casi toda baja real
          exige o entrar en tu cuenta, o mandar un correo que salga de tu
          dirección. Los servicios que prometen lo contrario están automatizando
          formularios y cobrando por ello.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-(--color-texto-suave)">
          Lo que sí hace: encontrar dónde estás, redactar cada solicitud de
          borrado como exige el RGPD, y llevarte el seguimiento del plazo legal
          de un mes que tienen para responderte.
        </p>
      </section>

      <footer className="mt-16 border-t border-(--color-borde-suave) pt-6 text-xs leading-relaxed text-(--color-texto-tenue)">
        Analiza únicamente tus propios datos. Detección basada en{' '}
        <a
          className="underline hover:text-(--color-texto-suave)"
          href="https://github.com/WebBreacher/WhatsMyName"
        >
          WhatsMyName
        </a>{' '}
        (CC BY-SA 4.0) e instrucciones de baja de{' '}
        <a
          className="underline hover:text-(--color-texto-suave)"
          href="https://github.com/jdm-contrib/jdm"
        >
          JustDeleteMe
        </a>{' '}
        (MIT).
      </footer>
    </main>
  );
}
