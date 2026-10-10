import { PlatformAccessGate } from "@/components/platform-access-gate";
import { PlatformProfileControls } from "@/components/platform-profile-controls";
import { PlatformChrome } from "@/components/layout/platform-chrome";
import { TransactionHistory } from "@/components/transactions/transaction-history";

export const metadata = {
  title: "Transactions — SaphraONE",
};

export default function Transactions() {
  return (
    <PlatformAccessGate>
      <PlatformChrome
        actions={<PlatformProfileControls />}
        // The page draws its own header with a back button.
        hideHeader
        subtitle="The last three months"
        title="Transactions"
      >
        <TransactionHistory />
      </PlatformChrome>
    </PlatformAccessGate>
  );
}
