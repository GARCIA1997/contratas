import { redirect } from "next/navigation";

export default function QuincenalesPage() {
  redirect("/contratas?periodo=QUINCENAL");
}
