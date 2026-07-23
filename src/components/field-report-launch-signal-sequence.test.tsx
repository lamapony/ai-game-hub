import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FieldReportLaunchSignalSequence } from "./field-report-panel";

describe("field report launch-signal sequence", () => {
  test("renders first-seen machine evidence as one readable line", () => {
    const html = renderToStaticMarkup(
      <FieldReportLaunchSignalSequence signals={["CHECK.", "INVITE.", "START."]} />,
    );

    expect(html).toContain('data-signals="CHECK.|INVITE.|START."');
    expect(html).toContain("Observed automatically: CHECK. then INVITE. then START.");
  });

  test("states honestly when this host captured no signal", () => {
    const html = renderToStaticMarkup(<FieldReportLaunchSignalSequence signals={[]} />);

    expect(html).toContain('data-signals=""');
    expect(html).toContain("No launch signal captured on this host yet.");
  });
});
