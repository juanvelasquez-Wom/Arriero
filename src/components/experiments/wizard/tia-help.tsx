"use client";

// La Tía tiene una recomendación (propone; la persona revisa y guarda).
import { toast } from "sonner";
import { TiaSuggest } from "@/components/tia/tia-suggest";
import { Button } from "@/components/ui/button";
import { TEST_TYPE_LABEL } from "@/domain/labels";
import {
  applyDesignSuggestion,
  applyHypothesisOption,
  applyIceSuggestion,
  applyImprovedHypothesis,
  REVIEW_VERDICT_LABEL,
  type DesignField,
} from "@/domain/tia-recommendations";
import { reviewHypothesis, suggestDesign, suggestHypotheses, suggestIce } from "@/server/actions/tia-recommendations";
import type { WizardValues } from "../wizard-values";
import type { SetValues } from "./shared";

function hypothesisDraft(v: WizardValues) {
  return {
    problem_id: v.problem_id,
    metric_id: v.metric_id,
    title: v.title,
    hypothesis_if: v.hypothesis_if,
    hypothesis_then: v.hypothesis_then,
    hypothesis_because: v.hypothesis_because,
  };
}

function iceDraft(v: WizardValues) {
  return { ...hypothesisDraft(v), control: v.control, planned_start: v.planned_start || null, planned_end: v.planned_end || null };
}

function HypothesisParts({ si, entonces, porque }: { si: string; entonces: string; porque: string }) {
  return (
    <dl className="space-y-1 text-sm">
      <div>
        <dt className="inline font-semibold">SI </dt>
        <dd className="inline">{si}</dd>
      </div>
      <div>
        <dt className="inline font-semibold">ENTONCES </dt>
        <dd className="inline">{entonces}</dd>
      </div>
      <div>
        <dt className="inline font-semibold">PORQUE </dt>
        <dd className="inline">{porque}</dd>
      </div>
    </dl>
  );
}

/** Paso 2: tres hipótesis propuestas y la revisión de la hipótesis escrita. */
export function TiaHypothesisHelp({ programId, v, setV }: { programId: string; v: WizardValues; setV: SetValues }) {
  const ready = !!v.problem_id && !!v.metric_id;
  const hasText = !!(v.hypothesis_if.trim() || v.hypothesis_then.trim() || v.hypothesis_because.trim());
  return (
    <div className="space-y-2">
      <TiaSuggest
        label="Pídale hipótesis a la Tía"
        title="La Tía tiene una recomendación"
        disabled={!ready}
        disabledReason="Elija primero el problema y la métrica en el paso 1."
        run={() => suggestHypotheses(programId, hypothesisDraft(v))}
        render={(options, close) => (
          <ul className="space-y-2">
            {options.map((o, i) => (
              <li key={i} className="rounded-xl border bg-paper p-3">
                {o.title ? <div className="mb-1 font-medium">{o.title}</div> : null}
                <HypothesisParts si={o.si} entonces={o.entonces} porque={o.porque} />
                {o.why ? <p className="mt-1.5 text-xs text-soft">{o.why}</p> : null}
                {o.based_on ? <p className="mt-0.5 text-xs text-soft">Se basa en: {o.based_on}</p> : null}
                <Button
                  type="button"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    setV((prev) => applyHypothesisOption(prev, o));
                    toast.success("¡Eso! Hipótesis puesta en el formulario", { description: "Revísela, ajústela a su gusto y guarde. Nada se guardó solo." });
                    close();
                  }}
                >
                  Usar esta
                </Button>
              </li>
            ))}
          </ul>
        )}
      />
      <TiaSuggest
        label="La Tía le revisa la hipótesis"
        title="La Tía le revisa la hipótesis"
        disabled={!ready || !hasText}
        disabledReason={ready ? "Escriba algo de la hipótesis y la Tía se la revisa." : undefined}
        run={() => reviewHypothesis(programId, hypothesisDraft(v))}
        render={(r, close) => (
          <div className="space-y-2 text-sm">
            <p>
              Veredicto de la Tía: <strong>{REVIEW_VERDICT_LABEL[r.verdict]}</strong>
            </p>
            {r.issues.length ? (
              <ul className="list-disc space-y-1 pl-5">
                {r.issues.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            ) : null}
            <div className="rounded-xl border bg-paper p-3">
              <div className="mb-1 text-xs font-medium text-soft">Versión mejorada</div>
              <HypothesisParts si={r.improved.si} entonces={r.improved.entonces} porque={r.improved.porque} />
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setV((prev) => applyImprovedHypothesis(prev, r.improved));
                toast.success("Versión mejorada aplicada", { description: "Cambie los [corchetes] por lo suyo y guarde." });
                close();
              }}
            >
              Aplicar la versión mejorada
            </Button>
          </div>
        )}
      />
    </div>
  );
}

/** Paso 3: una calificación ICE sugerida con sus razones (solo quien puede calificar). */
export function TiaIceHelp({ programId, v, setV }: { programId: string; v: WizardValues; setV: SetValues }) {
  return (
    <TiaSuggest
      label="¿Qué calificación le pondría la Tía?"
      title="La Tía tiene una recomendación"
      disabled={!v.problem_id || !v.metric_id}
      run={() => suggestIce(programId, iceDraft(v))}
      render={(s, close) => (
        <div className="space-y-2 text-sm">
          <ul className="grid gap-2 sm:grid-cols-3">
            {(
              [
                ["impact", "Impacto"],
                ["confidence", "Confianza"],
                ["ease", "Facilidad"],
              ] as const
            ).map(([k, label]) => (
              <li key={k} className="rounded-xl border bg-paper p-3">
                <div className="flex items-baseline justify-between">
                  <span className="font-medium">{label}</span>
                  <span className="font-heading text-lg font-extrabold tabular-nums">{s[k]}</span>
                </div>
                {s.why[k] ? <p className="mt-1 text-xs text-soft">{s.why[k]}</p> : null}
              </li>
            ))}
          </ul>
          <p className="text-xs text-soft">Es una sugerencia: la calificación la pone el equipo. Puede mover los controles después.</p>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setV((prev) => applyIceSuggestion(prev, s));
              toast.success("Valores puestos en los controles", { description: "Muévalos si no está de acuerdo y guarde." });
              close();
            }}
          >
            Usar estos valores
          </Button>
        </div>
      )}
    />
  );
}

const DESIGN_FIELD_LABEL: Record<DesignField, string> = {
  test_type: "tipo de prueba",
  min_duration_days: "duración mínima",
  decision_rule: "regla de decisión",
  variants: "variantes",
};

/** Paso 4: diseño sugerido; "Aplicar" solo llena lo vacío. */
export function TiaDesignHelp({ programId, v, setV }: { programId: string; v: WizardValues; setV: SetValues }) {
  return (
    <TiaSuggest
      label="Pídale el diseño a la Tía"
      title="La Tía tiene una recomendación"
      disabled={!v.problem_id || !v.metric_id}
      run={() =>
        suggestDesign(programId, {
          ...iceDraft(v),
          test_type: v.test_type,
          min_duration_days: v.min_duration_days,
          decision_rule: v.decision_rule,
          control_metrics: v.control_metrics,
          variants: v.variants.map((x) => ({ name: x.name, description: x.description, is_control: x.is_control })),
        })
      }
      render={(d, close) => (
        <div className="space-y-2 text-sm">
          <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
            {d.test_type ? (
              <>
                <dt className="text-soft">Tipo de prueba</dt>
                <dd>{TEST_TYPE_LABEL[d.test_type]}</dd>
              </>
            ) : null}
            {d.min_duration_days != null ? (
              <>
                <dt className="text-soft">Duración mínima</dt>
                <dd className="tabular-nums">{d.min_duration_days} días</dd>
              </>
            ) : null}
            {d.decision_rule ? (
              <>
                <dt className="text-soft">Regla de decisión</dt>
                <dd>{d.decision_rule}</dd>
              </>
            ) : null}
          </dl>
          {d.variants.length ? (
            <ul className="space-y-1">
              {d.variants.map((x, i) => (
                <li key={i} className="rounded-lg border bg-paper px-2.5 py-1.5">
                  <span className="font-medium">{x.name}</span>
                  {x.is_control ? <span className="text-xs text-soft"> · control</span> : null}
                  {x.description ? <span className="block text-xs text-soft">{x.description}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {d.risks.length ? (
            <div>
              <div className="text-xs font-medium text-soft">Ojo con</div>
              <ul className="list-disc space-y-0.5 pl-5">
                {d.risks.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-xs text-soft">Aplicar llena solo lo que esté vacío; las variantes, solo si siguen como vienen por defecto.</p>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              const r = applyDesignSuggestion(v, d);
              if (!r.filled.length) {
                toast("No había nada vacío que llenar", { description: "Lo que usted ya escribió se queda igual. Copie a mano lo que le sirva." });
                return;
              }
              setV((prev) => applyDesignSuggestion(prev, d).values);
              toast.success("Diseño de la Tía aplicado", {
                description: `Llenó: ${r.filled.map((f) => DESIGN_FIELD_LABEL[f]).join(", ")}. Revíselo y guarde.`,
              });
              close();
            }}
          >
            Aplicar
          </Button>
        </div>
      )}
    />
  );
}
