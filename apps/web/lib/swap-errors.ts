export function getSwapErrorMessage(message: string) {
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("401") ||
    normalizedMessage.includes("403") ||
    normalizedMessage.includes("unauthorized") ||
    normalizedMessage.includes("invalid api key") ||
    normalizedMessage.includes("invalid kit key")
  ) {
    return "Circle swap authorization failed. Make sure the server KIT_KEY is set and do not rely on a NEXT_PUBLIC kit key.";
  }

  if (
    normalizedMessage.includes("no route available") ||
    normalizedMessage.includes("route or resource not found") ||
    normalizedMessage.includes("createswap failed")
  ) {
    return "No live Circle App Kit route is available for this Arc Testnet pair right now. Try a smaller amount, flip the pair, or use Circle StableFX for USDC/EURC FX if your Circle account has StableFX access.";
  }

  return message;
}
