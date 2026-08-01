import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { DataTable, type TableColumn } from "../../app/components/dashboard/dataTable";

type Row = {
  id: string;
  name: string;
  amount: number;
};

const columns: TableColumn<Row>[] = [
  {
    key: "name",
    header: "Name",
    value: (row) => row.name,
    render: (row) => row.name,
  },
  {
    key: "amount",
    header: "Amount",
    value: (row) => row.amount,
    render: (row) => String(row.amount),
  },
];

describe("DataTable", () => {
  test("filters rows with the global search and clears the query", () => {
    render(
      <DataTable
        title="Positions"
        rows={[
          { id: "alpha", name: "Alpha", amount: 10 },
          { id: "beta", name: "Beta", amount: 20 },
        ]}
        columns={columns}
        getRowKey={(row) => row.id}
        emptyMessage="No positions"
      />
    );

    expect(screen.getByText("2 of 2 rows")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search rows" }), {
      target: { value: "Beta" },
    });

    expect(screen.getByText("1 of 2 rows")).toBeInTheDocument();
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.getAllByText("Beta").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByText("2 of 2 rows")).toBeInTheDocument();
  });
});
