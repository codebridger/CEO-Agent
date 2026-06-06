import { runAgent } from "./agent/runner.js";
import { commentPrompt, dmNavidPrompt, readPrompt } from "./triggers/manual.js";

function usage(): never {
  console.error(
    [
      "Usage: npm run trigger -- <kind> [args]",
      "",
      "Kinds:",
      "  read              Read the Subturtle.app list and summarise (no writes).",
      "  dm-navid          Send a short first private chat message to Navid as Aso Dara.",
      "  comment <taskId>  Read a task and post one comment as Aso Dara.",
    ].join("\n"),
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const [kind, ...rest] = process.argv.slice(2);

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
