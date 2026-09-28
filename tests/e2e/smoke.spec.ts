import { expect, test, type Page } from "@playwright/test";

// login → inicio → asistente del programa (programa + línea con métricas, árbol y embudo) →
// problema → buscador global → ejercicio (asistente de 5 pasos) → En prueba →
// borrarlo → restaurarlo desde la papelera.
//
// Selectores por rol y nombre accesible (no por clases ni ids internos) para
// que el test sobreviva a cambios de diseño.

/** Abre un select de shadcn/Radix por su nombre y elige una opción (o la primera). */
async function pickOption(page: Page, name: RegExp | string, option?: RegExp | string) {
  await page.getByRole("combobox", { name }).click();
  const options = option ? page.getByRole("option", { name: option }) : page.getByRole("option");
  await options.first().click();
}

function isoDate(offsetDays: number) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return d.toISOString().slice(0, 10);
}

test("flujo principal de un ejercicio", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const programName = `Programa E2E ${suffix}`;
  const problemTitle = `El costo por conversación subió en E2E ${suffix}`;
  const experimentTitle = `Ejercicio E2E ${suffix}`;

  // Login
  await page.goto("/login");
  await page.getByLabel("Correo").fill(process.env.E2E_EMAIL!);
  await page.getByLabel("Contraseña").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/);

  // Desde el inicio, "Crear un proyecto de growth" abre el asistente paso a paso (Pospago ya viene marcada).
  await page.getByRole("link", { name: /Crear un proyecto de growth/ }).first().click();
  await expect(page).toHaveURL(/\/programas\/nuevo$/);
  await expect(page.getByRole("heading", { name: /Arme su proyecto de growth/ })).toBeVisible();
  await page.getByRole("textbox", { name: /Nombre del programa/ }).fill(programName);
  await page.getByRole("button", { name: /^Siga/ }).click(); // → líneas
  await page.getByRole("button", { name: /^Siga/ }).click(); // → fechas
  await page.getByRole("button", { name: /^Siga/ }).click(); // → calendario
  // Sin calendario telco: así ningún congelamiento bloquea el lanzamiento de la prueba.
  // El radio va oculto dentro de su tarjeta: se hace clic en la tarjeta, como una persona.
  await page.locator("label", { has: page.getByRole("radio", { name: /No, sin calendario comercial/ }) }).click();
  await expect(page.getByRole("radio", { name: /No, sin calendario comercial/ })).toBeChecked();
  await page.getByRole("button", { name: /^Siga/ }).click(); // → resumen
  await page.getByRole("button", { name: /Arme el programa/ }).click();

  // El arranque lleva directo a registrar el primer problema, con la línea elegida.
  await expect(page).toHaveURL(/\/problemas\/nuevo\?.*desde=arranque/);
  await expect(page.getByText(/ya tiene el mapa/)).toBeVisible();
  await pickOption(page, /Etapa del embudo/);
  await page.getByRole("textbox", { name: /^Problema/ }).fill(problemTitle);
  await page.getByRole("textbox", { name: /Evidencia/ }).fill("La frecuencia pasó de 1,8 a 3,4 en seis semanas.");
  // Al crear no se pide el estado: siempre nace «Por validar».
  await expect(page.getByRole("combobox", { name: /^Estado/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Crear problema" }).click();
  await expect(page.getByRole("heading", { name: problemTitle })).toBeVisible();

  // Buscador global (Ctrl+K): encuentra el problema sin tildes.
  await page.keyboard.press("Control+k");
  const search = page.getByRole("dialog", { name: /Buscar en sus programas/ });
  await search.getByRole("combobox").fill(`costo por conversacion subio en e2e ${suffix}`);
  await expect(search.getByRole("option", { name: new RegExp(problemTitle) })).toBeVisible();
  await page.keyboard.press("Escape");

  // Ejercicio desde el problema (asistente de 5 pasos).
  await page.getByRole("link", { name: "Crear ejercicio desde este problema" }).click();
  await pickOption(page, /Métrica del árbol/);
  await page.getByRole("textbox", { name: /Título del ejercicio/ }).fill(experimentTitle);
  await page.getByRole("button", { name: "Guardar y seguir" }).click();
  await expect(page).toHaveURL(/\/editar\?paso=2/);

  // Paso 2: hipótesis completa (la base la exige para pasar a En diseño).
  await page.getByRole("textbox", { name: /^SI…/ }).fill("rotamos los creativos por videos testimoniales");
  await page.getByRole("textbox", { name: /^ENTONCES…/ }).fill("baja el costo por conversación");
  await page.getByRole("textbox", { name: /^PORQUE…/ }).fill("se corta la fatiga creativa");
  await page.getByRole("button", { name: "Guardar y seguir" }).click();

  // Paso 3: ICE.
  await expect(page.getByRole("slider")).toHaveCount(3);
  for (const slider of await page.getByRole("slider").all()) {
    await slider.focus();
    await slider.press("ArrowRight");
  }
  await page.getByRole("button", { name: "Guardar y seguir" }).click();

  // Paso 4: diseño (la métrica principal es la del árbol elegida en el paso 1).
  await page.getByRole("radio", { name: /A\/B/ }).click();
  await page.getByRole("spinbutton", { name: /Duración mínima/ }).fill("14");
  await page.getByRole("textbox", { name: /Regla de decisión/ }).fill("Escalar si la variante supera al control en 10%.");
  await page.getByRole("button", { name: "Guardar y seguir" }).click();

  // Paso 5: responsable y fechas.
  await pickOption(page, /^Responsable/, /Admin E2E/);
  await page.getByLabel("Inicio planeado").fill(isoDate(1));
  await page.getByLabel("Fin planeado").fill(isoDate(20));
  await page.getByRole("button", { name: "Guardar y ver ejercicio" }).click();
  await expect(page.getByRole("heading", { name: experimentTitle })).toBeVisible();

  // Transiciones hasta En prueba.
  await page.getByRole("button", { name: "Priorizar" }).click();
  await expect(page.getByRole("button", { name: "Pasar a diseño" })).toBeEnabled();
  await page.getByRole("button", { name: "Pasar a diseño" }).click();
  await expect(page.getByRole("button", { name: "Lanzar prueba" })).toBeEnabled();
  await page.getByRole("button", { name: "Lanzar prueba" }).click();
  await expect(page.getByText("En prueba").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Cerrar y leer resultados" })).toBeVisible();

  // Borrar y restaurar desde la papelera.
  await page.getByRole("button", { name: "Borrar", exact: true }).first().click();
  const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
  await expect(dialog.getByText(/2 variantes/)).toBeVisible();
  await dialog.getByRole("button", { name: "Borrar", exact: true }).click();
  await expect(page).toHaveURL(/\/ejercicios$/);

  await page.getByRole("link", { name: "Papelera" }).first().click();
  await expect(page.getByText(experimentTitle)).toBeVisible();
  await page.getByRole("button", { name: "Restaurar" }).first().click();
  await expect(page.getByText(/la papelera está vacía/i)).toBeVisible();

  await page.getByRole("link", { name: "Ejercicios", exact: true }).first().click();
  await expect(page.getByRole("link", { name: experimentTitle })).toBeVisible();
});
