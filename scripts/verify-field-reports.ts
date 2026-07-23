import { auditFieldReports, formatFieldReportAudit } from "../src/lib/field-report-audit";

const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const paths = args.filter((arg) => arg !== "--json");

if (paths.length === 0) {
  console.error(
    "Usage: bun run verify:field-reports [--json] path/to/report-1.json path/to/report-2.json ...",
  );
  process.exit(2);
}

const values: unknown[] = [];
for (const path of paths) {
  try {
    values.push(JSON.parse(await Bun.file(path).text()) as unknown);
  } catch (error) {
    console.error(`${path}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
}

const audit = auditFieldReports(values);
console.log(jsonOutput ? JSON.stringify(audit, null, 2) : formatFieldReportAudit(audit));
process.exit(audit.status === "pass" ? 0 : 1);
