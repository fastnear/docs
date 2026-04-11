const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const SOURCES = [
  {
    name: "fastnear",
    src: path.resolve(ROOT, "../fn/fastnear-api-server-rs/openapi"),
    dest: path.resolve(ROOT, "apis/fastnear"),
  },
  {
    name: "transactions",
    src: path.resolve(ROOT, "../fn/explorer-api/openapi"),
    dest: path.resolve(ROOT, "apis/transactions"),
  },
  {
    name: "transfers",
    src: path.resolve(ROOT, "../fn/transfers-api/openapi"),
    dest: path.resolve(ROOT, "apis/transfers"),
  },
  {
    name: "kv-fastdata",
    src: path.resolve(ROOT, "../fn/kv-fastdata-server/openapi"),
    dest: path.resolve(ROOT, "apis/kv-fastdata"),
  },
  {
    name: "neardata",
    src: path.resolve(ROOT, "../fn/neardata-server/openapi"),
    dest: path.resolve(ROOT, "apis/neardata"),
  },
];

for (const { name, src, dest } of SOURCES) {
  if (!fs.existsSync(src)) {
    throw new Error(`Missing source directory for ${name}: ${src}`);
  }

  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log(`Synced ${name}: ${src} -> ${dest}`);
}
