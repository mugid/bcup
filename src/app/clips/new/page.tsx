import { redirect } from "next/navigation";

export default function NewClipPage() {
  redirect("/?tab=videos");
}
