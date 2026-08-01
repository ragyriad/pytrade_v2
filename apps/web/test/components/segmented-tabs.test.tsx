import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { SegmentedTabs } from "../../app/components/dashboard/segmentedTabs";

describe("SegmentedTabs", () => {
  test("exposes the selected tab and reports user selection", () => {
    const onChange = vi.fn();

    render(
      <SegmentedTabs
        value="accounts"
        options={[
          { id: "accounts", label: "Accounts", count: 2 },
          { id: "transactions", label: "Transactions", count: 8 },
        ]}
        onChange={onChange}
      />
    );

    expect(screen.getByRole("tablist", { name: "View options" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Accounts/ })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByRole("tab", { name: /Transactions/ })).toHaveAttribute(
      "aria-selected",
      "false"
    );

    fireEvent.click(screen.getByRole("tab", { name: /Transactions/ }));

    expect(onChange).toHaveBeenCalledWith("transactions");
  });
});
