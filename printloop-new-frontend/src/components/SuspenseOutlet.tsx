import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { Loader, InlineLoader } from "@/components/ui/Loader";

export function SuspenseOutlet() {
  return (
    <Suspense fallback={<Loader />}>
      <Outlet />
    </Suspense>
  );
}

export function SuspenseInlineOutlet() {
  return (
    <Suspense fallback={<InlineLoader />}>
      <Outlet />
    </Suspense>
  );
}