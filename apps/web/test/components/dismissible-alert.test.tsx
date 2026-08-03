import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { DismissibleAlert } from "../../app/components/ui/dismissibleAlert";

describe("DismissibleAlert", () => {
  test("announces an API error and requests dismissal", () => {
    const onDismiss = vi.fn();
    render(
      <DismissibleAlert
        message="The API request failed."
        tone="error"
        onDismiss={onDismiss}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("The API request failed.");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss message" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  test("announces a successful API response without treating it as an error", () => {
    render(
      <DismissibleAlert
        message="The user was created."
        tone="success"
        onDismiss={vi.fn()}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("The user was created.");
  });
});
