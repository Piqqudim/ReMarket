import { redirect } from "next/navigation";

/** Services and service bookings are not available in this ReMarket release. */
export default function ServiceBookingMessagesUnavailablePage(): never {
  redirect("/shop");
}
