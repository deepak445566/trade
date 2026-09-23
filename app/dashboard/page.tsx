import type { Metadata } from "next";
import Workspace from "@/components/common/Workspace";

export const metadata: Metadata = { title: "Chart" };

export default function DashboardPage() {
  return <Workspace />;
}
