import os from "node:os";
import path from "node:path";

function expandHomeDir(input: string): string {
  if (input.startsWith("~/")) {
    return path.join(os.homedir(), input.slice(2));
  }
  if (input === "~") {
    return os.homedir();
  }
  return input;
}

/** Whether a home path is upstream Paseo's own default, `~/.paseo`. */
export function isUpstreamPaseoDefaultHome(value: string): boolean {
  return path.resolve(expandHomeDir(value)) === path.join(os.homedir(), ".paseo");
}

/**
 * `PASEO_HOME` still picks a home (dev checkouts and tests set it), except when it names upstream
 * Paseo's default: every process an upstream Paseo daemon starts inherits that value, and following
 * it would attach Stroll to Paseo's home and daemon. Set `STROLL_HOME` to choose `~/.paseo` on purpose.
 */
export function explicitPaseoHome(env: NodeJS.ProcessEnv): string | undefined {
  const paseoHome = env.PASEO_HOME;
  return paseoHome && !isUpstreamPaseoDefaultHome(paseoHome) ? paseoHome : undefined;
}

export function resolvePaseoHome(env: NodeJS.ProcessEnv = process.env): string {
  // Stroll keeps its own home so it can run beside an upstream Paseo install.
  const raw = env.STROLL_HOME ?? explicitPaseoHome(env) ?? "~/.stroll";
  const resolved = path.resolve(expandHomeDir(raw));
  return resolved;
}
