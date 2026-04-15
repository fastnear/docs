#!/usr/bin/env node

const fs = require("fs");

const {
  STANDALONE_BUILD_OUTDIR,
  buildStandaloneApp,
} = require("./standalone-common");

async function build() {
  fs.rmSync(STANDALONE_BUILD_OUTDIR, { recursive: true, force: true });
  await buildStandaloneApp(STANDALONE_BUILD_OUTDIR);
  console.log(`Standalone build written to ${STANDALONE_BUILD_OUTDIR}`);
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
