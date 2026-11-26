import { redirect } from "next/navigation";

/** Seller business claims are not part of the current ReMarket release. */
export default function SellerClaimsUnavailablePage(): never {
  redirect("/seller");
}
