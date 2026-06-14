import { NextResponse, type NextRequest } from "next/server";
import { isAddress } from "viem";

import {
  getArcScanHistoryUrls,
  normalizeArcScanTokenTransfers,
  type ArcScanTokenTransferResponse,
} from "@/lib/arcscan-history";

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");

  if (!address || !isAddress(address)) {
    return NextResponse.json(
      { message: "A valid wallet address is required." },
      { status: 400 },
    );
  }

  try {
    const responses = await Promise.all(
      getArcScanHistoryUrls(address).map((url) =>
        fetch(url, {
          cache: "no-store",
          headers: {
            accept: "application/json",
          },
        }),
      ),
    );

    if (responses.some((response) => !response.ok)) {
      return NextResponse.json(
        { message: "ArcScan could not load this wallet history." },
        { status: 502 },
      );
    }

    const payload = (await Promise.all(
      responses.map((response) => response.json()),
    )) as ArcScanTokenTransferResponse[];
    const transfers = normalizeArcScanTokenTransfers(address, payload);

    return NextResponse.json({ items: transfers });
  } catch {
    return NextResponse.json(
      { message: "Unable to reach ArcScan right now." },
      { status: 502 },
    );
  }
}
