import { redirect } from "next/navigation";

/** Services and service bookings are not available in this ReMarket release. */
export default function ServiceDetailsUnavailablePage(): never {
  redirect("/shop");
}
