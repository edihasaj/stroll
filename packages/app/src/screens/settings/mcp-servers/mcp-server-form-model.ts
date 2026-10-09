import type { DaemonMcpServer } from "@getpaseo/protocol/daemon-mcp-server";
import { RESERVED_DAEMON_MCP_SERVER_NAME } from "@getpaseo/protocol/daemon-mcp-server";

export type McpTransport = "stdio" | "http" | "sse";

export type McpServerNameError = "required" | "invalid" | "reserved" | "duplicate";
export interface McpServerFormSnapshot {
  mode: "create" | "edit";
  /** Names of the other servers on the host; the edited server's own name is not in here. */
  otherNames: readonly string[];
  /** The server being edited. */
  server?: { name: string; value: DaemonMcpServer };
}

export interface McpServerFormErrors {
  name?: McpServerNameError;
  command?: "required";
  url?: "required" | "invalid";
  env?: "invalid";
  headers?: "invalid";
}

export interface McpServerFormState {
  mode: "create" | "edit";
  name: string;
  transport: McpTransport;
  command: string;
  /** One argument per line. */
  args: string;
  /** One `KEY=value` per line. */
  env: string;
  url: string;
  /** One `Name: value` per line. */
  headers: string;
  /** Derived from the transport so a field cannot show for the wrong kind of server. */
  disclosure: { showCommandFields: boolean; showUrlFields: boolean };
  /** Empty until the first submit attempt; typing never shows an error. */
  errors: McpServerFormErrors;
  submitError: string | null;
}

export interface McpServerFormResult {
  name: string;
  value: DaemonMcpServer;
}

export interface McpServerFormModel {
  getState: () => McpServerFormState;
  subscribe: (listener: () => void) => () => void;
  close: () => void;
  setName: (value: string) => void;
  setTransport: (value: McpTransport) => void;
  setCommand: (value: string) => void;
  setArgs: (value: string) => void;
  setEnv: (value: string) => void;
  setUrl: (value: string) => void;
  setHeaders: (value: string) => void;
  setSubmitError: (message: string | null) => void;
  /** Validates. Returns the server to save, or null with `errors` filled in. */
  submit: () => McpServerFormResult | null;
}

const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const HEADER_NAME_PATTERN = /^[A-Za-z0-9-]+$/;

export function formatMcpLines(lines: readonly string[] | undefined): string {
  return (lines ?? []).join("\n");
}

export function formatMcpEnv(env: Record<string, string> | undefined): string {
  return Object.entries(env ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

export function formatMcpHeaders(headers: Record<string, string> | undefined): string {
  return Object.entries(headers ?? {})
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

function nonBlankLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Returns null when a line is not `KEY=value`. */
export function parseMcpEnv(text: string): Record<string, string> | null {
  const env: Record<string, string> = {};
  for (const line of nonBlankLines(text)) {
    const separator = line.indexOf("=");
    const key = separator < 0 ? "" : line.slice(0, separator).trim();
    if (!ENV_KEY_PATTERN.test(key)) {
      return null;
    }
    env[key] = line.slice(separator + 1).trim();
  }
  return env;
}

/** Returns null when a line is not `Name: value`. */
export function parseMcpHeaders(text: string): Record<string, string> | null {
  const headers: Record<string, string> = {};
  for (const line of nonBlankLines(text)) {
    const separator = line.indexOf(":");
    const name = separator < 0 ? "" : line.slice(0, separator).trim();
    if (!HEADER_NAME_PATTERN.test(name)) {
      return null;
    }
    headers[name] = line.slice(separator + 1).trim();
  }
  return headers;
}

function urlError(url: string): Pick<McpServerFormErrors, "url"> {
  if (url.length === 0) return { url: "required" };
  return isHttpUrl(url) ? {} : { url: "invalid" };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validateName(name: string, otherNames: readonly string[]): McpServerNameError | undefined {
  if (name.length === 0) return "required";
  if (name.toLowerCase() === RESERVED_DAEMON_MCP_SERVER_NAME) return "reserved";
  if (!SERVER_NAME_PATTERN.test(name)) return "invalid";
  if (otherNames.includes(name)) return "duplicate";
  return undefined;
}

type TransportFields = Pick<
  McpServerFormState,
  "command" | "args" | "env" | "url" | "headers" | "transport"
>;

interface BuiltConfig {
  config: DaemonMcpServer["config"] | null;
  errors: McpServerFormErrors;
}

function buildConfig(fields: TransportFields, alwaysLoad: boolean | undefined): BuiltConfig {
  const preserved = alwaysLoad === undefined ? {} : { alwaysLoad };
  if (fields.transport === "stdio") {
    const command = fields.command.trim();
    const env = parseMcpEnv(fields.env);
    const errors: McpServerFormErrors = {
      ...(command.length === 0 ? { command: "required" as const } : {}),
      ...(env === null ? { env: "invalid" as const } : {}),
    };
    if (Object.keys(errors).length > 0 || env === null) {
      return { config: null, errors };
    }
    const args = nonBlankLines(fields.args);
    return {
      config: {
        type: "stdio",
        command,
        ...(args.length > 0 ? { args } : {}),
        ...(Object.keys(env).length > 0 ? { env } : {}),
        ...preserved,
      },
      errors: {},
    };
  }

  const url = fields.url.trim();
  const headers = parseMcpHeaders(fields.headers);
  const errors: McpServerFormErrors = {
    ...urlError(url),
    ...(headers === null ? { headers: "invalid" as const } : {}),
  };
  if (Object.keys(errors).length > 0 || headers === null) {
    return { config: null, errors };
  }
  return {
    config: {
      type: fields.transport,
      url,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
      ...preserved,
    },
    errors: {},
  };
}

function seedState(snapshot: McpServerFormSnapshot): McpServerFormState {
  const config = snapshot.server?.value.config;
  const transport: McpTransport = config?.type ?? "stdio";
  return {
    mode: snapshot.mode,
    name: snapshot.server?.name ?? "",
    transport,
    command: config?.type === "stdio" ? config.command : "",
    args: config?.type === "stdio" ? formatMcpLines(config.args) : "",
    env: config?.type === "stdio" ? formatMcpEnv(config.env) : "",
    url: config && config.type !== "stdio" ? config.url : "",
    headers: config && config.type !== "stdio" ? formatMcpHeaders(config.headers) : "",
    disclosure: disclosureFor(transport),
    errors: {},
    submitError: null,
  };
}

function disclosureFor(transport: McpTransport): McpServerFormState["disclosure"] {
  return { showCommandFields: transport === "stdio", showUrlFields: transport !== "stdio" };
}

export function openMcpServerForm(snapshot: McpServerFormSnapshot): McpServerFormModel {
  const listeners = new Set<() => void>();
  const existing = snapshot.server?.value;
  let closed = false;
  let attempted = false;
  let state = seedState(snapshot);

  function publish(next: McpServerFormState): void {
    if (closed) return;
    state = { ...next, disclosure: disclosureFor(next.transport) };
    if (attempted) {
      state = { ...state, errors: validate(state).errors };
    }
    for (const listener of listeners) listener();
  }

  function validate(current: McpServerFormState): {
    errors: McpServerFormErrors;
    config: DaemonMcpServer["config"] | null;
  } {
    const name = current.name.trim();
    const built = buildConfig(current, existing?.config.alwaysLoad);
    const nameError = validateName(name, snapshot.otherNames);
    return {
      errors: { ...(nameError ? { name: nameError } : {}), ...built.errors },
      config: built.config,
    };
  }

  function set<K extends keyof McpServerFormState>(key: K, value: McpServerFormState[K]): void {
    publish({ ...state, [key]: value, submitError: null });
  }

  return {
    getState: () => state,
    subscribe(listener) {
      if (closed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close() {
      closed = true;
      listeners.clear();
    },
    setName: (value) => set("name", value),
    setTransport: (value) => set("transport", value),
    setCommand: (value) => set("command", value),
    setArgs: (value) => set("args", value),
    setEnv: (value) => set("env", value),
    setUrl: (value) => set("url", value),
    setHeaders: (value) => set("headers", value),
    setSubmitError(message) {
      publish({ ...state, submitError: message });
    },
    submit() {
      attempted = true;
      const { errors, config } = validate(state);
      publish({ ...state, errors, submitError: null });
      if (Object.keys(errors).length > 0 || !config) {
        return null;
      }
      return {
        name: state.name.trim(),
        value: {
          ...(existing?.enabled === undefined ? {} : { enabled: existing.enabled }),
          config,
        },
      };
    },
  };
}
