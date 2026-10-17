#!/usr/bin/env node
// Older Node versions crash inside tree-sitter's native binding (seen on
// 18.20, 20.20 and 22.8); say so instead of segfaulting.
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 23)) {
  console.error(`codezoom needs Node.js 22.23 or newer; this is ${process.version}.`);
  process.exit(1);
}
await import("../dist/server/cli.js");
