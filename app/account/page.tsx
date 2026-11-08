import { redirect } from "next/navigation";

/**
 * Keep /account as the stable Account Overview URL used by ReMarket
 * navigation while reusing the existing role-aware profile route.
 *
 * Buyers see /profile. Sellers and administrators are redirected by
 * that route to their respective dashboards.
 */
export default function AccountPage() {
  redirect("/profile");
}
