import { PlatformBrand } from "@/components/brand/platform-brand";

export default function PublicInvoiceLoading() {
  return (
    <main className="mx-auto max-w-lg px-6 py-16 text-sm text-muted-foreground">
      <PlatformBrand />
      <p className="mt-6">Loading invoice…</p>
    </main>
  );
}
