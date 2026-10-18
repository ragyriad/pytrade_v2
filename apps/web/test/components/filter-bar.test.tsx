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
    type: "Investment",
    management: "Self_Managed",
    subType: "TFSA",
    isRegistered: true,
    status: "active",
    balance: { amount: 1_000, currency: "CAD" },
    lastSyncedAt: null,
  },
  {
    id: "account-2",
    name: "Cash",
    institutionName: "Wealthsimple",
    accountCurrency: "CAD",
    type: "Expenses",
    subType: "CASH",
    isRegistered: false,
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
      subTypes: [],
      registered: [],
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
        value={{ brokerages: [], accountIds: [], accountTypes: [], subTypes: [], registered: [], timeline: "ALL" }}
        onChange={vi.fn()}
        costType={{ value: "both", onChange: onCostTypeChange }}
      />
    );

    fireEvent.change(screen.getByRole("combobox", { name: /Cost type/i }), {
      target: { value: "taxes" },
    });

    expect(onCostTypeChange).toHaveBeenCalledWith("taxes");
  });

  test("Select All restores every brokerage option after a partial selection", () => {
    const onChange = vi.fn();
    const value = {
      brokerages: ["Questrade"],
      accountIds: [],
      accountTypes: [],
      subTypes: [],
      registered: [],
      timeline: "ALL" as const,
    };

    render(<FilterBar accounts={accounts} value={value} onChange={onChange} />);
    fireEvent.click(screen.getAllByText("Questrade")[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Select All" })[0]);

    expect(onChange).toHaveBeenCalledWith({
      ...value,
      brokerages: ["Questrade", "Wealthsimple"],
    });
  });

  test("shows the registration and subtype controls and can select all values", () => {
    const onChange = vi.fn();
    const value = {
      brokerages: [],
      accountIds: [],
      accountTypes: [],
      subTypes: [],
      registered: [],
      timeline: "ALL" as const,
    };

    render(<FilterBar accounts={accounts} value={value} onChange={onChange} />);
    fireEvent.click(screen.getByText("All registration types"));
    fireEvent.click(screen.getAllByRole("button", { name: "Select All" }).at(-1)!);

    expect(onChange).toHaveBeenCalledWith({
      ...value,
      registered: ["Registered", "Non-registered"],
    });

    fireEvent.click(screen.getByText("All registration types"));
    fireEvent.click(screen.getByText("All subtypes"));
    fireEvent.click(screen.getAllByRole("button", { name: "Select All" }).at(-2)!);
    expect(onChange).toHaveBeenLastCalledWith({ ...value, subTypes: ["Non registered", "TFSA"] });
  });
});
