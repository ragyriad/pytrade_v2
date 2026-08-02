import { NextResponse } from "next/server";
import { fetchSecurityTransactionsFromBackend } from "../../../../repositories/securities";

export type SecurityTransactionsRouteContext = {
  params: Promise<{
    securityId: string;
  }>;
};

export async function GET(request: Request, context: SecurityTransactionsRouteContext) {
  const { securityId } = await context.params;

  try {
    const transactions = await fetchSecurityTransactionsFromBackend(
      securityId
    );
    return NextResponse.json(transactions);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load security transactions.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
