import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["test/global-setup.ts"],
    // One database shared by every test file: files run one at a time.
    fileParallelism: false,
    env: {
      DATABASE_URL:
        process.env["TEST_DATABASE_URL"] ?? "postgresql://taskly:taskly@localhost:5438/taskly_test",
    },
  },
});
