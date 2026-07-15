"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DeudorForm } from "@/components/deudores/deudor-form";
import { useAuthClaims } from "@/lib/offline/use-auth-claims";

export default function NuevoDeudorPage() {
  const claims = useAuthClaims();
  const router = useRouter();
  const esAdmin = claims.ready && claims.esAdmin;

  useEffect(() => {
    if (claims.ready && !esAdmin) router.replace("/deudores");
  }, [claims.ready, esAdmin, router]);

  if (!claims.ready || !esAdmin) return null;
  return <DeudorForm />;
}
