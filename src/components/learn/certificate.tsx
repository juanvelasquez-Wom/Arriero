/* eslint-disable @next/next/no-img-element -- en la impresión next/image puede no alcanzar a cargar; <img> sí. */
import { certificateLevel, certificateNumber, type CertificateKind } from "@/domain/certificates";
import { formatDate } from "@/domain/format";

// El cartón siempre va en claro (se imprime en papel blanco), sin importar el tema.
// Todo se mide en cqw (ancho del contenedor): se ve igual en el celular y en A4 horizontal.

const COPY: Record<CertificateKind, { title: string; body: (correct: number) => string; licence: string }> = {
  growth: {
    title: "Cartón de Arriero en Growth",
    body: (c) => `Arrió sin perderse las once ideas del growth y en el examen sacó ${c} de 10.`,
    licence:
      "Queda con licencia oficial para pedir el dato antes de opinar, probar antes de escalar y preguntar «¿y eso con qué evidencia?» en cualquier reunión, sin que lo miren feo.",
  },
  arriero: {
    title: "Cartón de Arriero de la Herramienta",
    body: (c) => `Recorrió el Arriero de punta a punta y en el examen sacó ${c} de 10.`,
    licence:
      "Queda con permiso para arrear programas, cargar los datos del lunes sin que se lo recuerden, lanzar por fuera de los congelamientos y no dejar un solo ejercicio huérfano. Ctrl + K es ahora su mejor amigo.",
  },
};

export interface CertificateData {
  kind: CertificateKind;
  name: string;
  correct: number;
  /** YYYY-MM-DD */
  date: string;
}

export function Certificate({ kind, name, correct, date, printable = false }: CertificateData & { printable?: boolean }) {
  const copy = COPY[kind];
  const level = certificateLevel(correct);
  const shown = name.trim() || "Arriero sin nombre";
  return (
    <div className={`${printable ? "print-certificate " : ""}@container w-full overflow-hidden rounded-xl bg-white shadow-card`}>
      <div className="relative aspect-[297/210] w-full text-[#111111]" style={{ fontSize: "1cqw" }}>
      {/* Marcos: negro grueso, amarillo fino. */}
      <div className="absolute inset-[2.2cqw] rounded-[0.8cqw] border-[0.45cqw] border-[#111111]" />
      <div className="absolute inset-[3.3cqw] rounded-[0.5cqw] border-[0.18cqw] border-[#F2C200]" />
      {/* Montañas de fondo. */}
      <svg aria-hidden viewBox="0 0 300 40" preserveAspectRatio="none" className="absolute inset-x-[3.5cqw] bottom-[3.5cqw] h-[9cqw] w-[calc(100%-7cqw)] opacity-[0.07]">
        <path d="M0 40 L40 12 L70 30 L110 4 L150 28 L190 8 L230 30 L265 14 L300 32 L300 40 Z" fill="#111111" />
      </svg>

      <div className="absolute inset-[5cqw] flex flex-col items-center text-center">
        <div className="flex w-full items-start justify-between">
          <img src="/brand/arriero-logo.png" alt="Arriero · Growth Engine" className="h-[11cqw] w-auto" />
          <Seal />
        </div>
        <div className="-mt-[5cqw] text-[1.25em] font-semibold uppercase tracking-[0.25em] text-[#5C5C5C]">
          La Muy Noble y Leal Cofradía de Arrieros del Growth
        </div>
        <h2 className="mt-[1.4cqw] max-w-[70%] text-balance font-heading text-[3.7em] leading-none font-extrabold">{copy.title}</h2>
        <p className="mt-[2.2cqw] text-[1.6em] text-[#5C5C5C]">Hace constar, con la mano en el carriel, que</p>
        <div className="mt-[0.6cqw] max-w-[80%] border-b-[0.2cqw] border-[#F2C200] px-[2cqw] pb-[0.3cqw] font-heading text-[4.4em] leading-tight font-extrabold break-words">
          {shown}
        </div>
        <p className="mt-[2cqw] max-w-[78%] text-[1.7em] leading-snug">
          {copy.body(correct)} {copy.licence}
        </p>
        <div className="mt-[2.2cqw] inline-flex items-center gap-[0.8cqw] rounded-full bg-[#F2C200] px-[1.8cqw] py-[0.5cqw] text-[1.5em] font-bold text-[#1F1F1F]">
          Nivel: {level.title}
          <span className="font-normal">· {level.note}</span>
        </div>

        <div className="mt-auto grid w-full grid-cols-3 items-end gap-[3cqw] text-[1.25em]">
          <Signature name="Doña Canela" role="La Mula Mayor · firma con la pata (derecha)" path="M5 30 C 20 5, 30 40, 45 18 S 70 5, 80 25 S 100 35, 115 10" />
          <div className="pb-[0.4cqw] text-[#5C5C5C]">
            Dado en la trocha, el {formatDate(date)}.
            <br />
            Válido en Caldas, Antioquia y alrededores (y en Bogotá, si lo dejan).
            <div className="mt-[0.4cqw] font-mono text-[0.9em] tracking-wider">{certificateNumber(kind, shown, date)}</div>
          </div>
          <Signature name="Don Aníbal de Jesús Restrepo Arango" role="El Arriero Jefe · dueño de la trocha y del tinto" path="M5 25 C 15 10, 25 10, 30 25 S 45 40, 55 15 C 60 5, 75 30, 90 20 L 115 22" />
        </div>
      </div>
      </div>
    </div>
  );
}

function Signature({ name, role, path }: { name: string; role: string; path: string }) {
  return (
    <div className="flex flex-col items-center">
      <svg aria-hidden viewBox="0 0 120 40" className="h-[4cqw] w-[70%]">
        <path d={path} fill="none" stroke="#111111" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
      <div className="w-full border-t-[0.12cqw] border-[#111111] pt-[0.4cqw] font-bold">{name}</div>
      <div className="text-[0.9em] text-[#5C5C5C]">{role}</div>
    </div>
  );
}

/** Sello amarillo: el texto del anillo se reparte solo (textLength) para que nunca se monte. */
function Seal() {
  return (
    <svg aria-hidden viewBox="0 0 140 140" className="h-[13.5cqw] w-[13.5cqw] rotate-[-12deg]">
      <defs>
        {/* Círculo que arranca arriba a la izquierda y gira en el sentido del reloj. */}
        <path id="seal-ring" d="M70 70 m -52 0 a 52 52 0 1 1 104 0 a 52 52 0 1 1 -104 0" />
      </defs>
      <circle cx="70" cy="70" r="68" fill="#F2C200" />
      <circle cx="70" cy="70" r="64" fill="none" stroke="#1F1F1F" strokeWidth="1.6" />
      <circle cx="70" cy="70" r="41" fill="none" stroke="#1F1F1F" strokeWidth="1.6" />
      <text fill="#1F1F1F" fontSize="11" fontWeight="800" fontFamily="Inter, Arial, sans-serif">
        <textPath href="#seal-ring" textLength="322" lengthAdjust="spacing">
          100% GARANTIZADO ★ NO MÁS CARRETA ★
        </textPath>
      </text>
      <text x="70" y="66" textAnchor="middle" fill="#1F1F1F" fontSize="19" fontWeight="900" fontFamily="Inter, Arial, sans-serif">
        ¡ARRE!
      </text>
      <text x="70" y="82" textAnchor="middle" fill="#1F1F1F" fontSize="9" fontWeight="800" letterSpacing="1.5" fontFamily="Inter, Arial, sans-serif">
        ORIGINAL
      </text>
    </svg>
  );
}
