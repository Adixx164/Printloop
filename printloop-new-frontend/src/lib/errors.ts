export function extractError(err: any): string {
  return (
    err?.data?.error?.message ||
    err?.data?.message ||
    err?.error ||
    err?.message ||
    "Something went amiss. Try again."
  );
}
