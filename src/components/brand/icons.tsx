import Image from "next/image";
import { cn } from "@/lib/utils";

// Íconos ilustrados de la marca (sello rústico, negro). Originales en
// docs/brand/arriero-iconos-original.webp; recortes en public/brand/icons/.
// Se invierten solos en modo oscuro (.brand-ink). Son ilustraciones: para
// botones y listas densas se siguen usando los íconos de lucide.
export const BRAND_ICONS = {
  "mula-datos": "La mula carga los datos",
  sombrero: "Sombrero aguadeño",
  mapa: "El mapa del camino",
  tinto: "Un tinto",
  portatil: "Métricas en la pantalla",
  "carriel-herramientas": "El carriel con las herramientas",
  "montana-cima": "La cima de la montaña",
  "mula-cargada": "La mula con la carga",
  arriero: "El arriero",
  "celular-ruta": "La ruta en el celular",
  embudo: "El embudo",
  "carriel-experimentos": "El carriel de los experimentos",
  "cafe-crecimiento": "El café que crece",
  "mula-sombrero": "La mula con sombrero",
  camino: "El camino entre montañas",
  diana: "Dar en el blanco",
} as const;

export type BrandIconName = keyof typeof BRAND_ICONS;

/** Ilustración de la marca. `decorative` (por defecto) la oculta a lectores de pantalla. */
export function BrandIcon({ name, className, decorative = true }: { name: BrandIconName; className?: string; decorative?: boolean }) {
  return (
    <Image
      src={`/brand/icons/${name}.png`}
      alt={decorative ? "" : BRAND_ICONS[name]}
      aria-hidden={decorative || undefined}
      width={256}
      height={256}
      className={cn("brand-ink h-auto select-none", className)}
    />
  );
}
