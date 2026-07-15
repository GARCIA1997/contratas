import { redirect } from "next/navigation";

export default function SemanalesPage() {
  redirect("/contratas?periodo=SEMANAL");
}
