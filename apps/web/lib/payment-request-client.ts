export type PaymentRequestStatusPayload = {
  message?: string;
  payable?: boolean;
  requestId?: string;
  status?: "pending" | "paid" | "declined" | "expired" | "unknown";
};

export async function fetchPaymentRequestStatus(requestId: string) {
  const response = await fetch(
    `/api/payment-requests/status?requestId=${encodeURIComponent(requestId)}`,
    { cache: "no-store" },
  );
  const payload = (await response.json().catch(() => null)) as
    | PaymentRequestStatusPayload
    | null;

  if (!response.ok) {
    throw new Error(payload?.message ?? "Payment request status failed.");
  }

  return {
    payable: payload?.payable !== false,
    status: payload?.status ?? "unknown",
  };
}

export async function completePaymentRequest(input: {
  circleSocialUuid?: string;
  ownerWallet: string;
  requestId: string;
  txHash?: string | null;
}) {
  const response = await fetch("/api/payment-requests/complete", {
    body: JSON.stringify(input),
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const payload = (await response.json().catch(() => null)) as {
    message?: string;
    status?: string;
  } | null;

  if (!response.ok) {
    throw new Error(payload?.message ?? "Could not close this payment request.");
  }

  return payload;
}

export function paymentRequestClosedMessage(
  status: "paid" | "declined" | "expired" | "pending" | "unknown",
) {
  if (status === "declined") {
    return "This payment request was declined and can no longer be paid.";
  }
  if (status === "paid") {
    return "This payment request was already paid. Ask for a new request link.";
  }
  if (status === "expired") {
    return "This payment request has expired. Create a new request to get paid.";
  }
  return null;
}
