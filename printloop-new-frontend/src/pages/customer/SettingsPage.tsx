import { useState } from "react";
import { useSelector } from "react-redux";
import { toast } from "sonner";
import type { RootState } from "@/store";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function SettingsPage() {
  const user = useSelector((s: RootState) => s.auth.user);
  const [profile, setProfile] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    phoneNumber: user?.phoneNumber || "",
  });

  return (
    <div>
      <div className="editorial-label text-persimmon mb-1">▸ SETTINGS</div>
      <h1 className="pl-serif text-4xl font-bold tracking-tight mb-1">
        Your <em className="italic text-persimmon font-semibold">account</em>.
      </h1>
      <p className="pl-serif italic text-ink/60 mb-7">Keep your details current.</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <aside className="border-2 border-ink p-4">
          <div className="editorial-label mb-3">SECTIONS</div>
          <ul className="space-y-1.5 text-sm">
            <li className="bg-persimmon text-paper px-3 py-2 font-bold tracking-wider text-xs">PROFILE</li>
            <li className="px-3 py-2 hover:bg-ink hover:text-paper font-bold tracking-wider text-xs cursor-pointer transition-colors">PASSWORD</li>
            <li className="px-3 py-2 hover:bg-ink hover:text-paper font-bold tracking-wider text-xs cursor-pointer transition-colors">NOTIFICATIONS</li>
            <li className="px-3 py-2 hover:bg-ink hover:text-paper font-bold tracking-wider text-xs cursor-pointer transition-colors">DELETE ACCOUNT</li>
          </ul>
        </aside>

        <div className="md:col-span-2 border-2 border-ink p-6">
          <h2 className="pl-serif text-2xl font-bold mb-4 tracking-tight">Profile.</h2>

          <Input label="EMAIL" value={user?.email || ""} disabled />

          <div className="grid grid-cols-2 gap-3">
            <Input label="FIRST NAME" value={profile.firstName} onChange={(e) => setProfile({ ...profile, firstName: e.target.value })} />
            <Input label="LAST NAME" value={profile.lastName} onChange={(e) => setProfile({ ...profile, lastName: e.target.value })} />
          </div>

          <Input label="PHONE" value={profile.phoneNumber} onChange={(e) => setProfile({ ...profile, phoneNumber: e.target.value })} />

          <Button variant="primary" arrow className="mt-3" onClick={() => toast.success("Profile updated.")}>
            SAVE CHANGES
          </Button>
        </div>
      </div>
    </div>
  );
}
