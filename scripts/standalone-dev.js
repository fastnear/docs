#!/usr/bin/env node

const fs = require("fs");

const {
  STANDALONE_DEV_OUTDIR,
  STANDALONE_ROUTE,
  buildStandaloneApp,
  createStandaloneServer,
  watchStandaloneModel,
  writeStandaloneArtifacts,
} = require("./standalone-common");

async function start() {
  const port = Number(process.env.STANDALONE_PORT || 4010);

  fs.rmSync(STANDALONE_DEV_OUTDIR, { recursive: true, force: true });

  const esbuildContext = await buildStandaloneApp(STANDALONE_DEV_OUTDIR, { watch: true });
  const stopWatching = watchStandaloneModel(() => {
    writeStandaloneArtifacts(STANDALONE_DEV_OUTDIR);
  });

  const server = createStandaloneServer(STANDALONE_DEV_OUTDIR);
  server.listen(port, "127.0.0.1", () => {
    console.log(`Standalone dev server listening on http://127.0.0.1:${port}${STANDALONE_ROUTE}`);
  });

  const shutdown = async () => {
    stopWatching();
    server.close();
    if (esbuildContext) {
      await esbuildContext.dispose();
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
