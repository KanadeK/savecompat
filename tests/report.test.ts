import { renderHtmlReport } from "../src/report.js";
import type { CheckReport } from "../src/types.js";

describe("HTML report", () => {
  it("renders a self-contained, escaped compatibility report", () => {
    const report: CheckReport = {
      tool: "savecompat",
      version: "0.1.0",
      generatedAt: "2026-07-28T00:00:00.000Z",
      configPath: "/tmp/<unsafe>.json",
      latestVersion: "3",
      summary: {
        total: 1,
        passed: 0,
        failed: 1,
        migrated: 0,
        unchanged: 1,
        durationMs: 1,
      },
      files: [
        {
          file: "<script>alert(1)</script>.json",
          durationMs: 1,
          passed: false,
          sourceVersion: "1",
          targetVersion: "3",
          output: null,
          applied: [],
          preservation: [],
          changes: [{ kind: "changed", path: "/xp", before: 1, after: 2 }],
          diagnostics: [
            {
              severity: "error",
              code: "TEST",
              message: "<b>unsafe</b>",
            },
          ],
        },
      ],
    };
    const html = renderHtmlReport(report);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("SaveCompat");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;b&gt;unsafe&lt;/b&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});
