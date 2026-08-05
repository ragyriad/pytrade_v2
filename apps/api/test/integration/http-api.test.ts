import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

const clerkMocks = vi.hoisted(() => ({
  verifyToken: vi.fn(async (token: string) => ({ sub: token })),
  getUser: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
  verifyToken: clerkMocks.verifyToken,
  createClerkClient: () => ({ users: { getUser: clerkMocks.getUser } }),
}));

import { db, eq, users } from "@repo/db";
import { fastify } from "../../src/server";
import { truncateApplicationTables } from "../../../../test/integration/support/database";
import {
  USER_A_ID,
  seedTwoUserPortfolio,
} from "../../../../test/integration/support/fixtures";

describe("Fastify HTTP and PostgreSQL integration", () => {
  beforeAll(async () => {
    await fastify.ready();
  });

  beforeEach(async () => {
    clerkMocks.verifyToken.mockClear();
    await truncateApplicationTables();
    await seedTwoUserPortfolio();
  });

  test("rejects a protected endpoint without a bearer token", async () => {
    const response = await fastify.inject({
      method: "GET",
      url: "/api/portfolio/dashboard",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "Authentication required." });
  });

  test("resolves the bearer identity and returns only that user's portfolio", async () => {
    const response = await fastify.inject({
      method: "GET",
      url: "/api/portfolio/dashboard",
      headers: { authorization: "Bearer user_integration_a" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      summary: {
        user: { id: USER_A_ID },
        accountCount: 1,
        positionCount: 1,
        transactionCount: 1,
      },
    });
    expect(clerkMocks.verifyToken).toHaveBeenCalledWith(
      "user_integration_a",
      expect.objectContaining({
        // The test setup provides a CI-safe fallback, while local `.env` files
        // may supply a different development key. Authentication wiring—not a
        // particular key value—is what this integration test verifies.
        secretKey: expect.stringMatching(/\S/),
        authorizedParties: ["http://localhost:3000"],
      })
    );
  });

  test("blocks a valid Clerk session when the local user is disabled", async () => {
    await db.update(users).set({ status: "disabled" }).where(eq(users.id, USER_A_ID));

    const response = await fastify.inject({
      method: "GET",
      url: "/api/portfolio/dashboard",
      headers: { authorization: "Bearer user_integration_a" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "This PyTrade account is disabled." });
  });

  test("validates route parameters after authentication", async () => {
    const response = await fastify.inject({
      method: "GET",
      url: "/api/securities/not-a-uuid/transactions",
      headers: { authorization: "Bearer user_integration_a" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "Invalid security id." });
  });
});
