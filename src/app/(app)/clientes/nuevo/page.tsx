"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ClienteForm } from "@/components/clientes/cliente-form";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";

export default function NuevoClientePage() {
  const claims = useAuthClaims();
  const router = useRouter();
  const esAdmin = claims.ready && claims.esAdmin;

  useEffect(() => {
    if (claims.ready && !esAdmin) router.replace("/clientes");
  }, [claims.ready, esAdmin, router]);

  if (!claims.ready || !esAdmin) return null;
  return <ClienteForm />;
}
