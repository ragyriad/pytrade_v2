import cors from "@fastify/cors";
import { verifyToken } from "@clerk/backend";
import Fastify, { type FastifyRequest } from "fastify";
import { z } from "zod";
import { checkDbConnection } from "@repo/db";
import {
  getDividendIncomeSummary,
  getStoredDividendEventsForSecurity,
} from "./services/dividends.js";
import {
  getDividendDashboardSummary,
  type DividendTimelineRange,
} from "./services/dividend_summary.js";
import { getAnnualAccountGains, getPerformanceSummary } from "./services/account_performance.js";
import { getCashDashboard } from "./services/cash.js";
import { getCalendarEvents } from "./services/calendar.js";
import { getPortfolioDashboard } from "./services/portfolio.js";
import {
  getHistoricSecurities,
  getSecurityTransactions,
} from "./services/securities.js";
import { resolveApplicationUser } from "./auth/application-user.js";

const port = Number(process.env.API_PORT ?? 3001);
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";

export const fastify = Fastify({ logger: process.env.NODE_ENV !== "test" });
const clerkSecretKey = process.env.CLERK_SECRET_KEY;

declare module "fastify" {
  interface FastifyRequest {
    clerkUserId: string | null;
    applicationUserId: string | null;
  }
}

const dividendTimelineSchema = z.enum([
  "NONE",
  "1M",
  "3M",
  "6M",
  "1Y",
  "2Y",
  "5Y",
  "ALL",
]);

await fastify.register(cors, {
  origin: [webOrigin],
  allowedHeaders: ["Authorization", "Content-Type"],
});
fastify.decorateRequest("clerkUserId", null);
fastify.decorateRequest("applicationUserId", null);

fastify.addHook("preHandler", async (request, reply) => {
  if (request.routeOptions.url === "/" || request.routeOptions.url === "/health") {
    return;
  }

  const authorization = request.headers.authorization;
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;
  if (!token || !clerkSecretKey) {
    return reply.status(401).send({ error: "Authentication required." });
  }

  let clerkUserId: string;
  try {
    const payload = await verifyToken(token, {
      secretKey: clerkSecretKey,
      authorizedParties: [webOrigin],
    });
    clerkUserId = payload.sub;
  } catch {
    return reply.status(401).send({ error: "Invalid or expired session." });
  }

  request.clerkUserId = clerkUserId;
  try {
    const resolution = await resolveApplicationUser(clerkUserId, clerkSecretKey);
    if (!resolution.ok) {
      const error = resolution.reason === "disabled"
        ? "This PyTrade account is disabled."
        : "This Clerk identity has not been invited to PyTrade.";
      return reply.status(403).send({ error });
    }
    request.applicationUserId = resolution.user.id;
  } catch (error) {
    request.log.error({ error, clerkUserId }, "Unable to resolve the application user");
    return reply.status(500).send({ error: "Unable to load the PyTrade account." });
  }
});

function authenticatedUserId(request: FastifyRequest): string {
  if (!request.applicationUserId) {
    throw new Error("Authenticated request did not resolve to an application user.");
  }
  return request.applicationUserId;
}

fastify.get("/", async () => ({ name: "pytrade-api", status: "ok" }));

fastify.get("/health", async () => {
  await checkDbConnection();
  return { status: "ok" };
});

fastify.get("/api/portfolio/dashboard", async (request, reply) => {
  const dashboard = await getPortfolioDashboard(authenticatedUserId(request));
  if (!dashboard) {
    return reply.status(404).send({ error: "No portfolio data found for this user." });
  }
  return dashboard;
});

fastify.get("/api/cash/dashboard", async (request, reply) => {
  const dashboard = await getCashDashboard(authenticatedUserId(request));
  if (!dashboard) {
    return reply.status(404).send({ error: "No cash data found for this user." });
  }
  return dashboard;
});

fastify.get("/api/securities/history", async (request, reply) => {
  const history = await getHistoricSecurities(authenticatedUserId(request));
  if (!history) {
    return reply.status(404).send({ error: "No securities data found for this user." });
  }
  return { securities: history };
});

fastify.get("/api/securities/:securityId/transactions", async (request, reply) => {
  const params = z.object({ securityId: z.string().uuid() }).safeParse(request.params);
  if (!params.success) {
    return reply.status(400).send({
      error: "Invalid security id.",
      issues: params.error.flatten().fieldErrors,
    });
  }

  const transactions = await getSecurityTransactions(
    params.data.securityId,
    authenticatedUserId(request)
  );
  if (!transactions) {
    return reply.status(404).send({ error: "Security not found for this user." });
  }
  return transactions;
});

fastify.get("/api/securities/:securityId/dividends", async (request, reply) => {
  const params = z.object({ securityId: z.string().uuid() }).safeParse(request.params);
  if (!params.success) {
    return reply.status(400).send({
      error: "Invalid security id.",
      issues: params.error.flatten().fieldErrors,
    });
  }

  // Authentication is still required even though dividend events are security-wide.
  authenticatedUserId(request);
  const events = await getStoredDividendEventsForSecurity(params.data.securityId);
  return { events };
});

fastify.get("/api/dividends/income", async (request, reply) => {
  const summary = await getDividendIncomeSummary(authenticatedUserId(request));
  if (!summary) {
    return reply.status(404).send({ error: "No dividend data found for this user." });
  }
  return summary;
});

fastify.get("/api/dividends/summary", async (request, reply) => {
  const query = z
    .object({
      timeline: dividendTimelineSchema.default("ALL"),
      accountIds: z.string().optional(),
    })
    .safeParse(request.query);

  if (!query.success) {
    return reply.status(400).send({
      error: "Invalid query string.",
      issues: query.error.flatten().fieldErrors,
    });
  }

  const accountIds = query.data.accountIds?.split(",").filter(Boolean);
  const invalidAccountId = accountIds?.find(
    (accountId) => !z.string().uuid().safeParse(accountId).success
  );
  if (invalidAccountId) {
    return reply.status(400).send({
      error: "Invalid account id.",
      issues: { accountIds: [`Invalid account id: ${invalidAccountId}`] },
    });
  }

  const summary = await getDividendDashboardSummary({
    userId: authenticatedUserId(request),
    timeline: query.data.timeline as DividendTimelineRange,
    accountIds,
  });
  if (!summary) {
    return reply.status(404).send({ error: "No dividend data found for this user." });
  }
  return summary;
});

fastify.get("/api/calendar/events", async (request) => {
  return { events: await getCalendarEvents(authenticatedUserId(request)) };
});

fastify.get("/api/performance/annual-account-gains", async (request, reply) => {
  const gains = await getAnnualAccountGains(authenticatedUserId(request));
  if (!gains) {
    return reply.status(404).send({ error: "No performance data found for this user." });
  }
  return gains;
});

fastify.get("/api/performance", async (request, reply) => {
  const performance = await getPerformanceSummary(authenticatedUserId(request));
  if (!performance) {
    return reply.status(404).send({ error: "No value history found for this user." });
  }
  return performance;
});

if (process.env.PYTRADE_API_NO_LISTEN !== "true") {
  try {
    const address = await fastify.listen({ port, host: "0.0.0.0" });
    fastify.log.info(`Server listening at ${address}`);
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
}
