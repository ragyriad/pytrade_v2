import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { FilterBar } from "../../app/components/dashboard/filterBar";
import type { AccountDto } from "../../app/lib/portfolioTypes";

const accounts: AccountDto[] = [
  {
    id: "account-1",
    name: "TFSA",
    institutionName: "Questrade",
    accountCurrency: "CAD",
    type: "TFSA",
    status: "active",
    balance: { amount: 1_000, currency: "CAD" },
    lastSyncedAt: null,
  },
  {
    id: "account-2",
    name: "Cash",
    institutionName: "Wealthsimple",
    accountCurrency: "CAD",
    type: "CASH",
    status: "open",
    balance: { amount: 500, currency: "CAD" },
    lastSyncedAt: null,
  },
];

describe("FilterBar", () => {
  test("emits brokerage and timeline changes", () => {
    const onChange = vi.fn();
    const value = {
      brokerages: [],
      accountIds: [],
      accountTypes: [],
      timeline: "ALL" as const,
    };

    render(<FilterBar accounts={accounts} value={value} onChange={onChange} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Questrade" }));
    expect(onChange).toHaveBeenCalledWith({ ...value, brokerages: ["Questrade"] });

    fireEvent.change(screen.getByRole("combobox", { name: /Timeline/i }), {
      target: { value: "3M" },
    });
    expect(onChange).toHaveBeenCalledWith({ ...value, timeline: "3M" });
  });

  test("renders and updates the optional cost-type control", () => {
    const onCostTypeChange = vi.fn();

    render(
      <FilterBar
        accounts={accounts}
        value={{ brokerages: [], accountIds: [], accountTypes: [], timeline: "ALL" }}
        onChange={vi.fn()}
        costType={{ value: "both", onChange: onCostTypeChange }}
      />
    );

    fireEvent.change(screen.getByRole("combobox", { name: /Cost type/i }), {
      target: { value: "taxes" },
    });

    expect(onCostTypeChange).toHaveBeenCalledWith("taxes");
  });
});
