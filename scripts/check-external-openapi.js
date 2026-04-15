const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const REQUIRE_EXTERNAL_CHECKS =
  process.env.REQUIRE_EXTERNAL_API_CHECKS === "true";

const SERVICES = [
  {
    name: "fastnear",
    dir: path.resolve(ROOT, "../fn/fastnear-api-server-rs"),
  },
  {
    name: "transactions",
    dir: path.resolve(ROOT, "../fn/explorer-api"),
  },
  {
    name: "transfers",
    dir: path.resolve(ROOT, "../fn/transfers-api"),
  },
  {
    name: "kv-fastdata",
    dir: path.resolve(ROOT, "../fn/kv-fastdata-server"),
  },
  {
    name: "neardata",
    dir: path.resolve(ROOT, "../fn/neardata-server"),
  },
];

function hasCargoManifest(dir) {
  return fs.existsSync(path.join(dir, "Cargo.toml"));
}

function runCheck({ name, dir }) {
  console.log(`Checking ${name}: cargo run --features openapi --bin generate-openapi -- --check`);
  const result = spawnSync(
    "cargo",
    ["run", "--features", "openapi", "--bin", "generate-openapi", "--", "--check"],
    {
      cwd: dir,
      stdio: "inherit",
      env: process.env,
      shell: process.platform === "win32",
    }
  );

  if (result.status !== 0) {
    throw new Error(`OpenAPI stale-spec check failed for ${name}.`);
  }
}

function main() {
  const available = SERVICES.filter(({ dir }) => hasCargoManifest(dir));
  const missing = SERVICES.filter(({ dir }) => !hasCargoManifest(dir));

  if (missing.length > 0) {
    const message =
      "Skipping missing external service repos: " +
      missing.map(({ name, dir }) => `${name} (${dir})`).join(", ");

    if (REQUIRE_EXTERNAL_CHECKS) {
      throw new Error(message);
    }

    console.warn(message);
  }

  if (available.length === 0) {
    console.warn("No external service repos were found; skipping stale-spec checks.");
    return;
  }

  for (const service of available) {
    runCheck(service);
  }

  console.log(
    `External OpenAPI source checks passed for ${available.length} repo(s).`
  );
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
