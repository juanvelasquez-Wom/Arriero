export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-wash px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <span aria-hidden className="inline-block size-3 rounded-sm bg-highlight" />
          <span className="text-sm font-semibold tracking-wide text-ink">Growth Framework</span>
        </div>
        <div className="rounded-xl border bg-paper p-6 shadow-sm">{children}</div>
        <p className="mt-4 text-xs text-soft">Acceso solo por invitación.</p>
      </div>
    </main>
  );
}
