// Child process of the parallel-registration test: adds one entry to the index of the sandbox target.
import { register } from "../../tools/lib/evidence.mjs";

const i = process.argv[2];
register("gnucash", {
  id: `rb_parallel_${i}`,
  kind: "rea",
  tool: "rea-agents",
  operation: "inspect-pe-resources",
  created_at: new Date().toISOString(),
  file: `rea/parallel-${i}.json`,
  bytes: 2,
  sha256: "b".repeat(64),
});
