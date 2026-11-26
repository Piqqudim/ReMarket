import type { ReactNode } from "react";
import AdminWorkspaceShell from "@/components/admin/AdminWorkspaceShell";

export default function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <AdminWorkspaceShell>{children}</AdminWorkspaceShell>;
}
