import type { Metadata } from "next";
import { AppHeader } from "@/components/app/app-header";
import { LessonDeck } from "@/components/learn/lesson-deck";
import { requireUser } from "@/server/auth";

export const metadata: Metadata = { title: "Aprender growth" };

export default async function LearnPage() {
  const user = await requireUser();
  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
        <header className="rise mb-5">
          <h1 className="text-2xl font-extrabold sm:text-3xl">No sé nada de growth y quiero aprender</h1>
          <p className="mt-1 text-[15px] text-soft">Once ideas, una por pantalla, con ejemplos de telco. Al final, examen y cartón firmado por la Mula Mayor. Tinto incluido.</p>
        </header>
        <LessonDeck userName={user.name || ""} />
      </main>
    </>
  );
}
