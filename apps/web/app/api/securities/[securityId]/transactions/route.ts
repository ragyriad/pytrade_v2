import { NextResponse } from "next/server";
import { fetchSecurityTransactionsFromBackend } from "../../../../repositories/securities";

export type SecurityTransactionsRouteContext = {
  params: {
    securityId: string;
  };
};

export async function GET(request: Request, context: SecurityTransactionsRouteContext) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId") ?? undefined;

  try {
    const transactions = await fetchSecurityTransactionsFromBackend(
      context.params.securityId,
      userId
    );
    return NextResponse.json(transactions);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load security transactions.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
