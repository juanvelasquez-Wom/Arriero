"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { ProblemInput } from "@/lib/validation/problems";
import { ProblemForm } from "./problem-form";

export function EditProblem(props: {
  programId: string;
  problemId: string;
  lines: { id: string; name: string }[];
  stages: { id: string; name: string; line_id: string }[];
  defaults: ProblemInput;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Pencil aria-hidden /> Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar problema</DialogTitle>
        </DialogHeader>
        <ProblemForm {...props} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
