import { PrivSwiftPayFeaturePage } from "./privswiftpay-feature-page";

export default function PrivSwiftPayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <PrivSwiftPayFeaturePage />
      {children}
    </>
  );
}
