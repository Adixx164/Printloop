import { Outlet } from "react-router-dom";
import { Marquee } from "@/components/layout/Marquee";
import { EditorialFooter } from "@/components/layout/EditorialFooter";

export function AuthLayout() {
  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      <Marquee
        items={[
          { text: "● 12 STATIONS LIVE", accent: true },
          { text: "★ FREE TOP-UP ON YOUR FIRST PRINT" },
          { text: "YABA · UNILAG · UI · OAU · LASU · COVENANT" },
          { text: "● 47 PRINTS THIS HOUR", accent: true },
          { text: "NEW: GROUP PRINTING" },
          { text: "VOL. I · ISSUE 09 · LAGOS" },
        ]}
      />
      <main className="flex-1">
        <Outlet />
      </main>
      <EditorialFooter inverse />
    </div>
  );
}
