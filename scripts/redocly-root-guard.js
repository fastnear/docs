const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(PROJECT_ROOT, "redocly.yaml");
const WORKTREES_ROOT = path.join(PROJECT_ROOT, ".claude", "worktrees");

function rel(filePath) {
  return path.relative(PROJECT_ROOT, filePath) || ".";
}

function collectNestedConfigs() {
  if (!fs.existsSync(WORKTREES_ROOT)) {
    return [];
  }

  const matches = [];
  const worktrees = fs.readdirSync(WORKTREES_ROOT, { withFileTypes: true });

  for (const entry of worktrees) {
    if (!entry.isDirectory()) {
      continue;
    }

    const worktreeRoot = path.join(WORKTREES_ROOT, entry.name);
    for (const fileName of ["redocly.yaml", "sidebars.yaml"]) {
      const fullPath = path.join(worktreeRoot, fileName);
      if (fs.existsSync(fullPath)) {
        matches.push(fullPath);
      }
    }
  }
  return matches.sort();
}

function printContext(commandName) {
  console.error(`Redocly ${commandName} project dir: ${PROJECT_ROOT}`);
  console.error(`Redocly ${commandName} config: ${CONFIG_PATH}`);
}

function ensureRootCwd(commandName) {
  const actualCwd = path.resolve(process.cwd());

  if (actualCwd === PROJECT_ROOT) {
    return;
  }

  console.error(`Run ${commandName} from the mike-docs repo root.`);
  console.error(`Expected cwd: ${PROJECT_ROOT}`);
  console.error(`Actual cwd:   ${actualCwd}`);
  process.exit(1);
}

function printWorktreeWarning(nestedConfigs, { fatal }) {
  const level = fatal ? "Unsupported local preview state detected." : "Warning:";
  console.error(level);
  console.error(
    "Root mike-docs is the only supported Redocly project for local preview and QA."
  );
  console.error(
    "Nested .claude/worktrees Redocly configs are treated as stale/disposable agent artifacts."
  );
  console.error("Detected nested Redocly files:");
  for (const filePath of nestedConfigs) {
    console.error(`- ${rel(filePath)}`);
  }
  console.error(
    "If you see broken-link diagnostics referencing .claude/worktrees/..., you are looking at a stale nested project rather than the current portal config."
  );

  if (fatal) {
    console.error(
      "Remove the stale worktree copy or stop using it for portal QA, then rerun preview from the repo root."
    );
  } else {
    console.error(
      "Continuing because build/lint validate the root project, not those nested copies."
    );
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });

  process.exit(result.status || 0);
}

function main() {
  const mode = process.argv[2];
  const extraArgs = process.argv.slice(3);

  if (!mode) {
    console.error("Usage: node scripts/redocly-root-guard.js <preview|lint|build>");
    process.exit(1);
  }

  ensureRootCwd(mode);
  printContext(mode);

  const nestedConfigs = collectNestedConfigs();
  const fatalForPreview = mode === "preview";

  if (nestedConfigs.length > 0) {
    printWorktreeWarning(nestedConfigs, { fatal: fatalForPreview });
    if (fatalForPreview) {
      process.exit(1);
    }
  }

  if (mode === "preview") {
    run("npx", [
      "@redocly/cli",
      "preview",
      "--project-dir",
      PROJECT_ROOT,
      ...extraArgs,
    ]);
  }

  if (mode === "lint") {
    run("npx", [
      "@redocly/cli",
      "lint",
      "--config",
      CONFIG_PATH,
      ...extraArgs,
    ]);
  }

  if (mode === "build") {
    return;
  }

  if (mode !== "preview" && mode !== "lint" && mode !== "build") {
    console.error(`Unsupported mode: ${mode}`);
    process.exit(1);
  }
}

main();
