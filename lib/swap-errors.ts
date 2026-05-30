export function getSwapErrorMessage(message: string) {
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("no route available") ||
    normalizedMessage.includes("route or resource not found") ||
    normalizedMessage.includes("createswap failed")
  ) {
    return "Circle has no Arc Testnet swap route for this pair right now. This is a routing/liquidity issue, not a wallet connection issue.";
  }

  return message;
}
