import { spawnSync } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";

const run = (command, args) => {
  const result = spawnSync(command, args, {
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
run("tsc", ["-p", "tsconfig.json"]);
await cp("manifest.json", "dist/manifest.json");
await cp("src/content.css", "dist/content.css");
await cp("src/popup.html", "dist/popup.html");
await cp("src/popup.css", "dist/popup.css");
