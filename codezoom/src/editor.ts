// "Open in Rider" (round 3). macOS only for v1: finds Rider by its bundle id
// and hands it a file and line the way JetBrains documents, which forwards
// to the running Rider when there is one.

import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface Editor {
  name: string;
  app: string;
}

export function findRider(): Editor | null {
  if (process.platform !== "darwin") return null;
  const candidates: string[] = [];
  try {
    const found = execFileSync("mdfind", ["kMDItemCFBundleIdentifier == 'com.jetbrains.rider'"], { encoding: "utf8", timeout: 2000 });
    candidates.push(...found.split("\n").filter((p) => p.endsWith(".app")));
  } catch {
    // Spotlight off or slow: fall back to the usual places
  }
  candidates.push("/Applications/Rider.app", join(homedir(), "Applications/Rider.app"), join(homedir(), "Applications/JetBrains Toolbox/Rider.app"));
  const app = candidates.find((p) => existsSync(p));
  return app ? { name: "Rider", app } : null;
}

/** Opens the file at the line in the editor. Resolves false when the launch fails. */
export function openInEditor(editor: Editor, file: string, line: number): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("open", ["-na", editor.app, "--args", "--line", String(line), file], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

/** Shows the file selected in Finder (Explorer, or the folder elsewhere): "Reveal in Finder" for assets. */
export function revealInFileManager(file: string): Promise<boolean> {
  const [cmd, args] =
    process.platform === "darwin" ? ["open", ["-R", file]] : process.platform === "win32" ? ["explorer", [`/select,${file}`]] : ["xdg-open", [dirname(file)]];
  return new Promise((resolve) => {
    const child = spawn(cmd, args as string[], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    // Explorer exits 1 even when it worked
    child.on("exit", (code) => resolve(code === 0 || process.platform === "win32"));
  });
}
