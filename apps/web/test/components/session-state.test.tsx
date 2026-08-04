import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test } from "vitest";
import {
  SessionStateScopeProvider,
  clearPersistedSession,
  useSessionState,
} from "../../app/state/sessionState";

function Preference() {
  const [checked, setChecked] = useSessionState("test:checked", false);
  return (
    <label>
      Remember me
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => setChecked(event.target.checked)}
      />
    </label>
  );
}

function renderPreference(sessionId = "session_test") {
  return render(
    <SessionStateScopeProvider isReady sessionId={sessionId}>
      <Preference />
    </SessionStateScopeProvider>
  );
}

describe("session-scoped UI state", () => {
  beforeEach(() => window.sessionStorage.clear());

  test("survives a remount in the same Clerk session and tab", () => {
    const firstRender = renderPreference();
    fireEvent.click(screen.getByRole("checkbox", { name: "Remember me" }));
    expect(screen.getByRole("checkbox", { name: "Remember me" })).toBeChecked();

    firstRender.unmount();
    renderPreference();

    expect(screen.getByRole("checkbox", { name: "Remember me" })).toBeChecked();
  });

  test("does not leak state between Clerk sessions", () => {
    const firstRender = renderPreference("session_one");
    fireEvent.click(screen.getByRole("checkbox", { name: "Remember me" }));
    firstRender.unmount();

    renderPreference("session_two");

    expect(screen.getByRole("checkbox", { name: "Remember me" })).not.toBeChecked();
  });

  test("removes persisted UI state when a session is cleared", () => {
    const firstRender = renderPreference();
    fireEvent.click(screen.getByRole("checkbox", { name: "Remember me" }));
    firstRender.unmount();

    clearPersistedSession("session_test");
    renderPreference();

    expect(screen.getByRole("checkbox", { name: "Remember me" })).not.toBeChecked();
  });
});
