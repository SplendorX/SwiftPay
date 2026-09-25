export type BeneficiaryRecord = {
  owner_wallet: string;
  name: string;
  beneficiary_wallet: string;
  username?: string | null;
};

/** Who is editing: the owner, plus their Circle login when signed in with one. */
export type BeneficiaryAuth = { ownerWallet: string; circleSocialUuid?: string };

async function readMessage(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as { message?: string } | null;
  return payload?.message ?? fallback;
}

/** Rename a contact and/or move it to another wallet. */
export async function updateBeneficiary(
  auth: BeneficiaryAuth,
  input: { beneficiaryWallet: string; name: string; newBeneficiaryWallet?: string },
): Promise<BeneficiaryRecord> {
  const response = await fetch("/api/beneficiaries", {
    body: JSON.stringify({ ...auth, ...input }),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });
  if (!response.ok) {
    throw new Error(await readMessage(response, "Contact could not be updated."));
  }
  const payload = (await response.json()) as { beneficiary: BeneficiaryRecord };
  return payload.beneficiary;
}

export async function deleteBeneficiary(auth: BeneficiaryAuth, beneficiaryWallet: string) {
  const params = new URLSearchParams({ ownerWallet: auth.ownerWallet, beneficiaryWallet });
  if (auth.circleSocialUuid) params.set("circleSocialUuid", auth.circleSocialUuid);
  const response = await fetch(`/api/beneficiaries?${params.toString()}`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(await readMessage(response, "Contact could not be deleted."));
  }
}
