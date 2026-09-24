/**
 * `/saas/closed` — landing state after a tenant owner closes their
 * account. Plain, final, with a support contact for reversal during
 * the 30-day cooling-off window.
 */
export default function ClosedPage() {
  return (
    <div className="max-w-md mx-auto p-12 text-center">
      <div className="editorial-label text-persimmon mb-1">▸ ACCOUNT CLOSED</div>
      <h1 className="pl-serif font-extrabold text-3xl tracking-tight">
        Account closed
      </h1>
      <p className="text-ink/60 mt-3">
        Your PrintLoop account is closed and printing has stopped. Your
        data will be permanently deleted after 30 days.
      </p>
      <p className="text-ink/60 mt-3">
        Changed your mind? Email{" "}
        <a
          className="font-bold text-persimmon border-b-2 border-persimmon"
          href="mailto:support@printloop.app"
        >
          support@printloop.app
        </a>{" "}
        within 30 days to reactivate.
      </p>
    </div>
  );
}
