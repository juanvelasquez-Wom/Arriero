"use client";

// Último recurso: si falla el layout raíz. No puede usar los componentes de la app
// (ni sus estilos globales garantizados), así que va con estilos en línea y la
// paleta de Arriero.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f6f6f4", color: "#111111" }}>
        <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ maxWidth: 480, background: "#ffffff", border: "1px solid #e2e2df", borderRadius: 16, padding: 24 }}>
            <h1 style={{ margin: 0, fontSize: 22 }}>¡Juepucha! La app se enredó</h1>
            <p style={{ color: "#595959" }}>Algo falló al cargar Arriero. Ya quedó registrado; intente de nuevo en un momentico.</p>
            <button
              type="button"
              onClick={() => reset()}
              style={{ background: "#f2c200", color: "#1f1f1f", border: 0, borderRadius: 10, padding: "10px 16px", fontWeight: 600, cursor: "pointer" }}
            >
              Intentar de nuevo
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
