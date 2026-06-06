import { runAgent } from "./agent/runner.js";
import { runHeartbeat } from "./rhythms/heartbeat.js";
import { runPmCheck } from "./rhythms/pmCheck.js";
import { commentPrompt, dmNavidPrompt, readPrompt } from "./triggers/manual.js";

function usage(): never {
  console.error(
    [
      "Usage: npm run trigger -- <kind> [args]",
      "",
      "Kinds:",
      "  read              Read the Subturtle.app list and summarise (no writes).",
      "  dm-navid          Send a short first private chat message to Navid.",
      "  comment <taskId>  Read a task and post one comment.",
      "  pm-check          Run the PM check now (drain inbox, sweep active work).",
      "  heartbeat         Run the heartbeat now (assess, draft, write a beat log).",
    ].join("\n"),
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const [kind, ...rest] = process.argv.slice(2);

  // Rhythms are full routines, not a single prompt → runAgent.
  if (kind === "pm-check" || kind === "heartbeat") {
    console.error(`[trigger:${kind}] running...`);
    const r = kind === "heartbeat" ? await runHeartbeat() : await runPmCheck();
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  }

  let task: string;
  switch (kind) {
    case "read":
      task = readPrompt();
      break;
    case "dm-navid":
      task = dmNavidPrompt();
      break;
    case "comment": {
      const taskId = rest[0];
      if (!taskId) {
        console.error("comment requires a <taskId>\n");
        usage();
      }
      task = commentPrompt(taskId);
      break;
    }
    default:
      usage();
  }

  console.error(`[trigger:${kind}] running...`);
  const result = await runAgent({ task });

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
