import cors from "@fastify/cors";
import Fastify from "fastify";
import { z } from "zod";
import { checkDbConnection } from "@repo/db";
import {
  fetchTiingoDividendsForTicker,
  getDividendIncomeSummary,
  getStoredDividendEventsForSecurity,
  syncTiingoDividendsForSecurity,
  syncTiingoDividendsForSymbol,
} from "./dividends.service.js";
import { getAnnualAccountGains } from "./performance.service.js";
import { getPortfolioDashboard } from "./portfolio.service.js";
import {
  getHistoricSecurities,
  getSecurityTransactions,
} from "./securities.service.js";

const port = Number(process.env.API_PORT ?? 3001);
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";

const fastify = Fastify({
  logger: true,
});

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

const dividendRangeSchema = z.object({
  startExDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endExDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

fastify.get("/api/data-providers/tiingo/dividends/:ticker", async (request, reply) => {
  const params = z
    .object({
      ticker: z.string().min(1).max(50),
    })
    .safeParse(request.params);
  const query = dividendRangeSchema.safeParse(request.query);

  if (!params.success) {
    return reply.status(400).send({
      error: "Invalid ticker.",
      issues: params.error.flatten().fieldErrors,
    });
  }

  if (!query.success) {
    return reply.status(400).send({
      error: "Invalid query string.",
      issues: query.error.flatten().fieldErrors,
    });
  }

  const events = await fetchTiingoDividendsForTicker(params.data.ticker, query.data);
  return { events };
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

fastify.post("/api/dividends/sync/tiingo/security/:securityId", async (request, reply) => {
  const params = z
    .object({
      securityId: z.string().uuid(),
    })
    .safeParse(request.params);
  const body = dividendRangeSchema.safeParse(request.body ?? {});

  if (!params.success) {
    return reply.status(400).send({
      error: "Invalid security id.",
      issues: params.error.flatten().fieldErrors,
    });
  }

  if (!body.success) {
    return reply.status(400).send({
      error: "Invalid request body.",
      issues: body.error.flatten().fieldErrors,
    });
  }

  const result = await syncTiingoDividendsForSecurity(params.data.securityId, body.data);

  if (!result) {
    return reply.status(404).send({
      error: "Security not found.",
    });
  }

  return result;
});

fastify.post("/api/dividends/sync/tiingo/symbol/:symbol", async (request, reply) => {
  const params = z
    .object({
      symbol: z.string().min(1).max(50),
    })
    .safeParse(request.params);
  const body = dividendRangeSchema.safeParse(request.body ?? {});

  if (!params.success) {
    return reply.status(400).send({
      error: "Invalid symbol.",
      issues: params.error.flatten().fieldErrors,
    });
  }

  if (!body.success) {
    return reply.status(400).send({
      error: "Invalid request body.",
      issues: body.error.flatten().fieldErrors,
    });
  }

  const result = await syncTiingoDividendsForSymbol(params.data.symbol, body.data);
  return result;
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
