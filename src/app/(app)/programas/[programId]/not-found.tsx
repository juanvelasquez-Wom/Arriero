import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl rounded-xl border bg-paper p-6">
      <h2 className="text-base font-semibold">No encontramos lo que busca</h2>
      <p className="mt-1 text-sm text-soft">Puede que se haya borrado o que no tenga acceso.</p>
      <Link href="/programas" className="mt-4 inline-block text-sm underline underline-offset-4">
        Volver a mis programas
      </Link>
    </div>
  );
}
