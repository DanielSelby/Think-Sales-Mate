import { redirect } from "next/navigation";
import { getProductAppPath } from "@/lib/product-app-routes";

export default function NewEducationAdmissionPage() {
  redirect(`${getProductAppPath("think-education", "/admissions")}?new=1`);
}
