import cors from "@fastify/cors";
import Fastify from "fastify";
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
import { getAnnualAccountGains } from "./services/account_performance.js";
import { getPortfolioDashboard } from "./services/portfolio.js";
import {
  getHistoricSecurities,
  getSecurityTransactions,
} from "./services/securities.js";

const port = Number(process.env.API_PORT ?? 3001);
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";

const fastify = Fastify({
  logger: true,
});

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
});

fastify.get("/", async () => ({
  name: "pytrade-api",
  status: "ok",
}));

fastify.get("/health", async () => {
  await checkDbConnection();
  return { status: "ok" };
});

fastify.get("/api/portfolio/dashboard", async (request, reply) => {
  const query = z
    .object({
      userId: z.string().uuid().optional(),
    })
    .safeParse(request.query);

  if (!query.success) {
    return reply.status(400).send({
      error: "Invalid query string.",
      issues: query.error.flatten().fieldErrors,
    });
  }

  const dashboard = await getPortfolioDashboard(query.data.userId);

  if (!dashboard) {
    return reply.status(404).send({
      error: "No user data found. Run the sync or seed a user first.",
    });
  }

  return dashboard;
});

fastify.get("/api/securities/history", async (request, reply) => {
  const query = z
    .object({
      userId: z.string().uuid().optional(),
    })
    .safeParse(request.query);

  if (!query.success) {
    return reply.status(400).send({
      error: "Invalid query string.",
      issues: query.error.flatten().fieldErrors,
    });
  }

  const history = await getHistoricSecurities(query.data.userId);

  if (!history) {
    return reply.status(404).send({
      error: "No user data found. Run the sync or seed a user first.",
    });
  }

  return { securities: history };
});

fastify.get("/api/securities/:securityId/transactions", async (request, reply) => {
  const params = z
    .object({
      securityId: z.string().uuid(),
    })
    .safeParse(request.params);
  const query = z
    .object({
      userId: z.string().uuid().optional(),
    })
    .safeParse(request.query);

  if (!params.success) {
    return reply.status(400).send({
      error: "Invalid security id.",
      issues: params.error.flatten().fieldErrors,
    });
  }

  if (!query.success) {
    return reply.status(400).send({
      error: "Invalid query string.",
      issues: query.error.flatten().fieldErrors,
    });
  }

  const transactions = await getSecurityTransactions(
    params.data.securityId,
    query.data.userId
  );

  if (!transactions) {
    return reply.status(404).send({
      error: "Security not found for the selected user.",
    });
  }

  return transactions;
});

fastify.get("/api/securities/:securityId/dividends", async (request, reply) => {
  const params = z
    .object({
      securityId: z.string().uuid(),
    })
    .safeParse(request.params);

  if (!params.success) {
    return reply.status(400).send({
      error: "Invalid security id.",
      issues: params.error.flatten().fieldErrors,
    });
  }

  const events = await getStoredDividendEventsForSecurity(params.data.securityId);
  return { events };
});

fastify.get("/api/dividends/income", async (request, reply) => {
  const query = z
    .object({
      userId: z.string().uuid().optional(),
    })
    .safeParse(request.query);

  if (!query.success) {
    return reply.status(400).send({
      error: "Invalid query string.",
      issues: query.error.flatten().fieldErrors,
    });
  }

  const summary = await getDividendIncomeSummary(query.data.userId);

  if (!summary) {
    return reply.status(404).send({
      error: "No user data found. Run the sync or seed a user first.",
    });
  }

  return summary;
});

fastify.get("/api/dividends/summary", async (request, reply) => {
  const query = z
    .object({
      userId: z.string().uuid().optional(),
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

  const accountIds =
    query.data.accountIds == null
      ? undefined
      : query.data.accountIds.split(",").filter(Boolean);
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
    userId: query.data.userId,
    timeline: query.data.timeline as DividendTimelineRange,
    accountIds,
  });

  if (!summary) {
    return reply.status(404).send({
      error: "No user data found. Run the sync or seed a user first.",
    });
  }

  return summary;
});

fastify.get("/api/performance/annual-account-gains", async (request, reply) => {
  const query = z
    .object({
      userId: z.string().uuid().optional(),
    })
    .safeParse(request.query);

  if (!query.success) {
    return reply.status(400).send({
      error: "Invalid query string.",
      issues: query.error.flatten().fieldErrors,
    });
  }

  const gains = await getAnnualAccountGains(query.data.userId);

  if (!gains) {
    return reply.status(404).send({
      error: "No user data found. Run the sync or seed a user first.",
    });
  }

  return gains;
});

try {
  const address = await fastify.listen({ port, host: "0.0.0.0" });
  fastify.log.info(`Server listening at ${address}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
