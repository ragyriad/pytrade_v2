import type {
  NewAccount,
  NewAccountBalance,
  NewAccountValueHistory,
  NewCalendarEvent,
  NewOption,
  NewPosition,
  NewSecurity,
  NewSecurityPriceSnapshot,
  NewTransaction,
} from "../schemas/index_schema.js";
import type { DemoSecurityTemplate } from "./catalog/securities.js";

export type DemoScenario = {
  metadata: {
    profile: "full";
    seed: string;
    asOf: string;
    userId: string;
    username: string;
  };
  catalog: readonly DemoSecurityTemplate[];
  securities: NewSecurity[];
  accounts: NewAccount[];
  accountBalances: NewAccountBalance[];
  accountValueHistory: NewAccountValueHistory[];
  positions: NewPosition[];
  options: NewOption[];
  transactions: NewTransaction[];
  calendarEvents: NewCalendarEvent[];
  priceSnapshots: NewSecurityPriceSnapshot[];
};

export type DemoSeedReport = {
  dryRun: boolean;
  userId: string;
  username: string;
  profile: string;
  seed: string;
  asOf: string;
  counts: {
    securities: number;
    accounts: number;
    accountBalances: number;
    accountValueHistory: number;
    positions: number;
    options: number;
    transactions: number;
    calendarEvents: number;
    priceSnapshots: number;
  };
  insertedSecurities?: number;
  reusedSecurities?: number;
};
