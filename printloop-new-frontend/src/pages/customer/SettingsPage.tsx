import { useState } from "react";
import { useSelector } from "react-redux";
import { toast } from "sonner";
import type { RootState } from "@/store";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useUpdateProfileMutation, useChangePasswordMutation } from "@/store/services/authApi";
import { extractError } from "@/lib/errors";
import { CONFIG } from "@/constants/config";

type ActiveTab = "profile" | "password" | "data";

export default function SettingsPage() {
  const user = useSelector((s: RootState) => s.auth.user);
  const [activeTab, setActiveTab] = useState<ActiveTab>("profile");

  const [profile, setProfile] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    phoneNumber: user?.phoneNumber || "",
  });

  const [passwordForm, setPasswordForm] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [updateProfile, { isLoading: isUpdatingProfile }] = useUpdateProfileMutation();
  const [changePassword, { isLoading: isChangingPassword }] = useChangePasswordMutation();
  const token = useSelector((s: RootState) => s.auth.accessToken);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const onExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch(`${CONFIG.apiBaseUrl}/customer/auth/export`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        throw new Error(`Export failed (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `printloop-customer-export-${user?.id ?? "customer"}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setExportError(e?.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const onDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmEmail.toLowerCase() !== user?.email.toLowerCase()) {
      setDeleteError(`Type your email "${user?.email}" to confirm account closure`);
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`${CONFIG.apiBaseUrl}/customer/auth/me`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ confirmEmail }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Delete failed");
      }
      toast.success("Account closed. 30-day cooling-off started. Contact support to reverse.");
      // Sign out
      localStorage.removeItem("pl_auth");
      window.location.href = "/";
    } catch (e: any) {
      setDeleteError(e?.message || "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!profile.firstName.trim() || !profile.lastName.trim() || !profile.phoneNumber.trim()) {
      toast.error("All profile fields are required");
      return;
    }
    try {
      await updateProfile({
        firstName: profile.firstName,
        lastName: profile.lastName,
        phoneNumber: profile.phoneNumber,
      }).unwrap();
      toast.success("Profile updated successfully.");
    } catch (err) {
      toast.error(extractError(err));
    }
  };

  const handleChangePassword = async () => {
    if (!passwordForm.oldPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      toast.error("All password fields are required");
      return;
    }
    if (passwordForm.newPassword.length < 10) {
      toast.error("New password must be at least 10 characters long");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("New password and confirm password do not match");
      return;
    }
    try {
      await changePassword({
        oldPassword: passwordForm.oldPassword,
        newPassword: passwordForm.newPassword,
      }).unwrap();
      toast.success("Password updated successfully.");
      setPasswordForm({
        oldPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (err) {
      toast.error(extractError(err));
    }
  };

  return (
    <div>
      <div className="editorial-label text-persimmon mb-1">▸ SETTINGS</div>
      <h1 className="pl-serif text-3xl sm:text-4xl font-bold tracking-tight mb-1">
        Your <em className="italic text-persimmon font-semibold">account</em>.
      </h1>
      <p className="pl-serif italic text-ink/60 mb-7">Keep your details current.</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <aside className="border-2 border-ink p-4">
          <div className="editorial-label mb-3">SECTIONS</div>
          <ul className="space-y-1.5 text-sm">
            <li
              onClick={() => setActiveTab("profile")}
              className={`px-3 py-2 font-bold tracking-wider text-xs cursor-pointer transition-colors ${
                activeTab === "profile" ? "bg-persimmon text-paper" : "hover:bg-ink hover:text-paper"
              }`}
            >
              PROFILE
            </li>
            <li
              onClick={() => setActiveTab("password")}
              className={`px-3 py-2 font-bold tracking-wider text-xs cursor-pointer transition-colors ${
                activeTab === "password" ? "bg-persimmon text-paper" : "hover:bg-ink hover:text-paper"
              }`}
            >
              PASSWORD
            </li>
            <li
              onClick={() => setActiveTab("data")}
              className={`px-3 py-2 font-bold tracking-wider text-xs cursor-pointer transition-colors ${
                activeTab === "data" ? "bg-persimmon text-paper" : "hover:bg-ink hover:text-paper"
              }`}
            >
              DATA & PRIVACY
            </li>
          </ul>
        </aside>

        <div className="md:col-span-2 border-2 border-ink p-4 sm:p-6 bg-paper-light">
          {activeTab === "profile" && (
            <div>
              <h2 className="pl-serif text-xl sm:text-2xl font-bold mb-4 tracking-tight">Profile.</h2>

              <Input label="EMAIL" value={user?.email || ""} disabled />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="FIRST NAME"
                  value={profile.firstName}
                  onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
                />
                <Input
                  label="LAST NAME"
                  value={profile.lastName}
                  onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
                />
              </div>

              <Input
                label="PHONE"
                value={profile.phoneNumber}
                onChange={(e) => setProfile({ ...profile, phoneNumber: e.target.value })}
              />

              <Button
                variant="primary"
                arrow
                className="mt-3"
                onClick={handleUpdateProfile}
                loading={isUpdatingProfile}
              >
                SAVE CHANGES
              </Button>
            </div>
          )}

          {activeTab === "password" && (
            <div>
              <h2 className="pl-serif text-xl sm:text-2xl font-bold mb-4 tracking-tight">Change Password.</h2>

              <Input
                label="CURRENT PASSWORD"
                type="password"
                value={passwordForm.oldPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, oldPassword: e.target.value })}
              />

              <Input
                label="NEW PASSWORD"
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
              />

              <Input
                label="CONFIRM NEW PASSWORD"
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
              />

              <Button
                variant="primary"
                arrow
                className="mt-3"
                onClick={handleChangePassword}
                loading={isChangingPassword}
              >
                UPDATE PASSWORD
              </Button>
            </div>
          )}

          {activeTab === "data" && (
            <div>
              <h2 className="pl-serif text-xl sm:text-2xl font-bold mb-4 tracking-tight">Data & Privacy.</h2>

              <section className="border-2 border-ink rounded-pl p-4 space-y-3 bg-paper-light">
                <h3 className="font-bold">Export your data</h3>
                <p className="text-sm text-ink/60">
                  Downloads a JSON archive of your print jobs, payments, transactions,
                  files, group sessions, disputes, reviews, and audit log. Credentials are
                  stripped.
                </p>
                <button
                  onClick={onExport}
                  disabled={exporting}
                  className="pl-btn-dark disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {exporting ? "Preparing…" : "Download export (JSON)"}
                </button>
                {exportError && <p className="text-persimmon text-sm font-semibold">{exportError}</p>}
              </section>

              <section className="border-2 border-persimmon rounded-pl p-4 space-y-3 bg-persimmon/5">
                <h3 className="font-bold text-persimmon uppercase tracking-wider text-sm">
                  ▸ Danger zone
                </h3>
                <p className="text-sm text-ink/70">
                  Closing your account stops all printing immediately and starts
                  a 30-day cooling-off window, after which your data is deleted.
                  Type your email to confirm.
                </p>
                <form onSubmit={onDelete} className="space-y-3">
                  <input
                    className="pl-input"
                    placeholder={user?.email || "your@email.com"}
                    value={confirmEmail}
                    onChange={(e) => setConfirmEmail(e.target.value)}
                  />
                  {deleteError && <p className="text-persimmon text-sm font-semibold">{deleteError}</p>}
                  <button
                    type="submit"
                    disabled={deleting || confirmEmail.toLowerCase() !== user?.email?.toLowerCase()}
                    className="pl-btn !bg-persimmon !text-paper !border-persimmon disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deleting ? "Closing…" : "Close this account"}
                  </button>
                </form>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
