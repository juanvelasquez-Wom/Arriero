import { expect, test, type Page } from "@playwright/test";

// login → crear programa → crear línea → crear métrica → crear problema →
// crear ejercicio → moverlo a "En prueba" → borrarlo → restaurarlo.

async function pickOption(page: Page, label: RegExp | string, option: RegExp | string) {
  await page.getByLabel(label).click();
  await page.getByRole("option", { name: option }).first().click();
}

function isoDate(offsetDays: number) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return d.toISOString().slice(0, 10);
}

test("flujo principal de un ejercicio", async ({ page }) => {
  const programName = `Programa E2E ${Date.now().toString(36)}`;

  // Login
  await page.goto("/login");
  await page.getByLabel("Correo").fill(process.env.E2E_EMAIL!);
  await page.getByLabel("Contraseña").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Mis programas" })).toBeVisible();

  // Crear programa (paso 1 del asistente)
  await page.getByRole("link", { name: "Crear programa" }).first().click();
  await page.getByLabel(/Nombre del programa/).fill(programName);
  await page.getByLabel(/Fecha de inicio/).fill(isoDate(-30));
  await page.getByLabel(/Fecha de fin/).fill(isoDate(200));
  await page.locator("#h-start-0").fill(isoDate(-30));
  await page.locator("#h-end-0").fill(isoDate(80));
  await page.locator("#h-start-1").fill(isoDate(81));
  await page.locator("#h-end-1").fill(isoDate(200));
  await page.getByRole("button", { name: "Crear programa y seguir" }).click();

  // Paso 2: línea
  await expect(page.getByRole("heading", { name: "Líneas de negocio" })).toBeVisible();
  await page.getByLabel("Nueva línea").fill("Pospago E2E");
  await page.getByRole("button", { name: "Agregar línea" }).click();
  await expect(page.getByText("Pospago E2E").first()).toBeVisible();

  // Métrica norte desde la vista de la línea
  await page.getByRole("link", { name: "Pospago E2E" }).first().click();
  await page.getByRole("button", { name: "Definir métrica norte" }).first().click();
  await page.getByRole("dialog").getByLabel(/^Nombre/).fill("Altas digitales E2E");
  await page.getByRole("button", { name: "Crear métrica" }).click();
  await expect(page.getByText("Altas digitales E2E").first()).toBeVisible();

  // Problema
  await page.getByRole("link", { name: "Problemas" }).first().click();
  await page.getByRole("link", { name: "Nuevo problema" }).first().click();
  await pickOption(page, /Etapa del embudo/, "Adquisición");
  await page.getByLabel(/^Problema/).fill("El costo por conversación subió en E2E");
  await page.getByLabel(/^Evidencia/).fill("La frecuencia pasó de 1,8 a 3,4 en seis semanas.");
  await page.getByRole("button", { name: "Crear problema" }).click();
  await expect(page.getByRole("heading", { name: "El costo por conversación subió en E2E" })).toBeVisible();

  // Ejercicio desde el problema (asistente de 5 pasos)
  await page.getByRole("link", { name: "Crear ejercicio desde este problema" }).click();
  await pickOption(page, /Métrica del árbol/, /Altas digitales E2E/);
  await page.getByLabel(/Título del ejercicio/).fill("Ejercicio E2E");
  await page.getByRole("button", { name: "Guardar y seguir" }).click();
  await expect(page).toHaveURL(/\/editar\?paso=2/);
  await page.getByLabel(/^SI/).fill("rotamos los creativos");
  await page.getByRole("button", { name: "Guardar y seguir" }).click();
  for (const slider of await page.getByRole("slider").all()) {
    await slider.focus();
    await slider.press("ArrowRight");
  }
  await page.getByRole("button", { name: "Guardar y seguir" }).click();
  await page.getByRole("radio", { name: /A\/B/ }).click();
  await page.getByLabel("Métrica principal").fill("Altas digitales");
  await page.getByLabel(/Duración mínima/).fill("14");
  await page.getByLabel(/Regla de decisión/).fill("Escalar si la variante supera al control en 10%.");
  await page.getByRole("button", { name: "Guardar y seguir" }).click();
  await pickOption(page, "Responsable", /Admin E2E/);
  await page.getByLabel("Inicio planeado").fill(isoDate(1));
  await page.getByLabel("Fin planeado").fill(isoDate(20));
  await page.getByRole("button", { name: "Guardar y ver ejercicio" }).click();
  await expect(page.getByRole("heading", { name: "Ejercicio E2E" })).toBeVisible();

  // Transiciones hasta En prueba
  await page.getByRole("button", { name: "Priorizar" }).click();
  await expect(page.getByRole("button", { name: "Pasar a diseño" })).toBeEnabled();
  await page.getByRole("button", { name: "Pasar a diseño" }).click();
  await expect(page.getByRole("button", { name: "Lanzar prueba" })).toBeEnabled();
  await page.getByRole("button", { name: "Lanzar prueba" }).click();
  await expect(page.getByText("En prueba").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Cerrar y leer resultados" })).toBeVisible();

  // Borrar y restaurar desde la papelera
  await page.getByRole("button", { name: "Borrar" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/2 variantes/)).toBeVisible();
  await dialog.getByRole("button", { name: "Borrar" }).click();
  await expect(page).toHaveURL(/\/ejercicios$/);

  await page.getByRole("link", { name: "Papelera" }).first().click();
  await expect(page.getByText("Ejercicio E2E")).toBeVisible();
  await page.getByRole("button", { name: "Restaurar" }).first().click();
  await expect(page.getByText("La papelera está vacía")).toBeVisible();

  await page.getByRole("link", { name: "Backlog de ejercicios" }).click();
  await expect(page.getByRole("link", { name: "Ejercicio E2E" })).toBeVisible();
});
