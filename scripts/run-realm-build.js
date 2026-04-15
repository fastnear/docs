const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const LOCAL_ENV_PATH = path.join(PROJECT_ROOT, ".env.redocly.local");
const SERVER_CACHE_DIR = path.join(
  PROJECT_ROOT,
  "node_modules",
  "@redocly",
  "realm",
  "dist",
  "server",
  "esbuild",
  "cache",
  "server"
);
const VALID_LOCAL_PLANS = new Set(["pro", "enterprise"]);
const SHOULD_REFRESH_EXAMPLES =
  process.argv.includes("--refresh-examples") ||
  process.env.REFRESH_RPC_EXAMPLES === "true";

function parseEnvFile(filePath) {
  const env = {};
  const raw = fs.readFileSync(filePath, "utf8");

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function loadLocalEnv() {
  if (!fs.existsSync(LOCAL_ENV_PATH)) {
    return false;
  }

  const parsed = parseEnvFile(LOCAL_ENV_PATH);
  for (const [key, value] of Object.entries(parsed)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }

  return true;
}

function looksLikeJwt(value) {
  if (!value) {
    return false;
  }

  const parts = value.split(".");
  return parts.length === 3 && parts.every(Boolean);
}

function getPlanGatesStatus(value) {
  if (!value) {
    return { valid: false, kind: "missing" };
  }

  if (value.startsWith("replace_with")) {
    return { valid: false, kind: "placeholder" };
  }

  if (!looksLikeJwt(value)) {
    return { valid: false, kind: "invalid_format" };
  }

  return { valid: true, kind: "valid" };
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function mirrorServerCacheEntriesToMjs(serverOutDir) {
  const entries = fs.readdirSync(serverOutDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".js")) {
      continue;
    }

    const sourcePath = path.join(serverOutDir, entry.name);
    const targetPath = path.join(
      serverOutDir,
      `${entry.name.slice(0, -".js".length)}.mjs`
    );

    fs.copyFileSync(sourcePath, targetPath);
  }
}

function printPlanGatesError(status, loadedLocalEnv) {
  const envHint = loadedLocalEnv
    ? `The file ${LOCAL_ENV_PATH} was loaded, but it does not provide a valid PLAN_GATES value.`
    : `Create ${LOCAL_ENV_PATH} with PLAN_GATES=... or export PLAN_GATES in your shell.`;

  if (status.kind === "missing") {
    console.error("Missing PLAN_GATES for Redocly Reunite build.");
    console.error("`realm build` requires a valid Plan Gates JWT in the environment.");
    console.error(envHint);
  } else if (status.kind === "placeholder") {
    console.error("PLAN_GATES is still set to the example placeholder value.");
    console.error(`Update ${LOCAL_ENV_PATH} with the real Redocly Plan Gates JWT.`);
  } else if (status.kind === "invalid_format") {
    console.error("PLAN_GATES does not look like a JWT.");
    console.error("Expected a three-part token like header.payload.signature.");
    console.error("This is different from REDOCLY_AUTHORIZATION, which is a personal API key.");
  }

  console.error(
    'For local validation without a JWT, set REDOCLY_LOCAL_PLAN=enterprise (or "pro").'
  );
  process.exit(1);
}

async function runInternalRealmBuild({ localPlan } = {}) {
  const normalizedPlan = localPlan ? String(localPlan).toLowerCase() : null;

  if (normalizedPlan && !VALID_LOCAL_PLANS.has(normalizedPlan)) {
    console.error(`Unsupported REDOCLY_LOCAL_PLAN "${localPlan}".`);
    console.error('Expected "pro" or "enterprise".');
    process.exit(1);
  }

  const [
    { createClientCompiler, createServerCompiler },
    { initPlugins, runPlugins },
    { renderPage, getServerProps },
    { beforeCommand },
    { Store },
    { EntitlementsProvider },
    { cliCommandNames },
    { getPageDataUrl, GLOBAL_DATA_URL },
  ] = await Promise.all([
    import("@redocly/realm/dist/server/esbuild/esbuild.js"),
    import("@redocly/realm/dist/server/plugins/lifecycle.js"),
    import("@redocly/realm/dist/server/ssr/index.js"),
    import("@redocly/realm/dist/server/utils/lifecycle-hooks.js"),
    import("@redocly/realm/dist/server/store.js"),
    import("@redocly/realm/dist/server/entitlements/entitlements-provider.js"),
    import("@redocly/realm/dist/server/constants.js"),
    import("@redocly/realm/dist/shared/urls.js"),
  ]);

  const args = {
    "project-dir": PROJECT_ROOT,
    verbose: false,
    htmlTemplate: "",
    outdir: "public",
  };
  const outdir = path.resolve(PROJECT_ROOT, args.outdir);
  const traceRoutes = process.env.REDOCLY_BUILD_TRACE === "true";
  const store = new Store({
    contentDir: PROJECT_ROOT,
    outdir,
    serverOutDir: SERVER_CACHE_DIR,
  });
  const previousPlanGates = process.env.PLAN_GATES;
  const restorePlanGates = previousPlanGates != null;

  if (normalizedPlan) {
    delete process.env.PLAN_GATES;
    console.error(
      `Using local Redocly entitlement fallback with plan "${normalizedPlan}" for this build.`
    );
    console.error("This bypasses PLAN_GATES for local validation only.");
    await EntitlementsProvider.instance().init({ developModePlan: normalizedPlan });
  } else {
    await EntitlementsProvider.instance().init();
  }

  let lifecycleContext;

  try {
    await beforeCommand(cliCommandNames.BUILD, args, store);

    const initialized = await initPlugins({
      contentDir: store.contentDir,
      outdir: store.outdir,
      serverOutDir: "",
      setGlobalConfig: store.setGlobalConfig,
    });
    lifecycleContext = initialized.lifecycleContext;

    await runPlugins(initialized.pluginInstances, store, lifecycleContext);

    const clientCompiler = await createClientCompiler(store, outdir, "production");
    const serverCompiler = await createServerCompiler(store, store.serverOutDir);

    await clientCompiler.rebuild();
    await serverCompiler.rebuild();
    await clientCompiler.dispose();
    await serverCompiler.dispose();

    // Redocly's build-mode markdown SSR looks for `.mjs` entries, but the
    // server cache compiler emits `.js` files into a `type: module` directory.
    mirrorServerCacheEntriesToMjs(store.serverOutDir);

    const routes = store.getAllRoutes();

    for (let index = 0; index < routes.length; index += 1) {
      const route = routes[index];

      if (traceRoutes) {
        console.error(`Rendering route ${index + 1}/${routes.length}: ${route.slug}`);
      } else if ((index + 1) % 25 === 0) {
        console.error(`Rendered ${index + 1}/${routes.length} routes so far...`);
      }

      try {
        const staticData = await store.resolveRouteStaticData(route, lifecycleContext);
        const serverProps = await getServerProps(route, null, staticData, store);
        const { html, props } = await renderPage(route, serverProps, null, store);
        const htmlPath = path.join(outdir, route.slug, "index.html");
        const pageDataPath = path.join(outdir, getPageDataUrl(route.slug));

        fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
        fs.mkdirSync(path.dirname(pageDataPath), { recursive: true });
        fs.writeFileSync(htmlPath, html, "utf8");
        fs.writeFileSync(
          pageDataPath,
          JSON.stringify({
            templateId: route.templateId,
            sharedDataIds: store.routesSharedData.get(route.slug) || {},
            props,
          }),
          "utf8"
        );
      } catch (error) {
        console.error(
          `Redocly render failed for route ${route.slug} (${route.fsPath || "unknown fsPath"}).`
        );
        throw error;
      }
    }

    const globalDataPath = path.join(outdir, GLOBAL_DATA_URL);
    fs.mkdirSync(path.dirname(globalDataPath), { recursive: true });
    fs.writeFileSync(globalDataPath, JSON.stringify(store.globalData), "utf8");

    if (store.searchEngine) {
      await store.searchEngine.export(store.outdir);
    }
  } finally {
    if (lifecycleContext?.fs) {
      await lifecycleContext.fs.dispose();
    }

    if (restorePlanGates) {
      process.env.PLAN_GATES = previousPlanGates;
    } else {
      delete process.env.PLAN_GATES;
    }
  }
}

async function main() {
  const loadedLocalEnv = loadLocalEnv();
  const planGatesStatus = getPlanGatesStatus(process.env.PLAN_GATES);
  const localPlan = process.env.REDOCLY_LOCAL_PLAN;

  if (SHOULD_REFRESH_EXAMPLES) {
    run("node", ["scripts/refresh-examples.js"]);
  }

  if (planGatesStatus.valid) {
    await runInternalRealmBuild();
    return;
  }

  if (localPlan) {
    await runInternalRealmBuild({ localPlan });
    return;
  }

  printPlanGatesError(planGatesStatus, loadedLocalEnv);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
