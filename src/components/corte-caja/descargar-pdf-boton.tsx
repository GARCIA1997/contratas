"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DescargarPdfBoton({ corteId }: { corteId: string }) {
  return (
    <Button variant="outline" size="sm" asChild>
      <a href={`/api/corte-caja/${corteId}/pdf`}>
        <Download className="size-4" /> PDF
      </a>
    </Button>
  );
}
