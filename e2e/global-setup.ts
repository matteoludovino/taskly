import { execFileSync } from "node:child_process";

export default function setup() {
  const url = process.env["E2E_DATABASE_URL"] ?? "postgresql://taskly:taskly@localhost:5438/taskly_e2e";
  execFileSync("npm", ["run", "db:prepare", "-w", "@taskly/server", "--", url], { stdio: "pipe" });
}
