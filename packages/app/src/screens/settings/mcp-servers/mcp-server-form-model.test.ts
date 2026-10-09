import { describe, expect, it } from "vitest";
import {
  openMcpServerForm,
  parseMcpEnv,
  parseMcpHeaders,
  type McpServerFormModel,
} from "./mcp-server-form-model";

function createForm(otherNames: string[] = []): McpServerFormModel {
  return openMcpServerForm({ mode: "create", otherNames });
}

describe("openMcpServerForm", () => {
  it("builds a stdio server from command, argument lines, and env lines", () => {
    const form = createForm();
    form.setName(" files ");
    form.setCommand(" npx ");
    form.setArgs("-y\n\n files-mcp \n");
    form.setEnv("ROOT=/repo\nTOKEN = a=b ");

    expect(form.submit()).toEqual({
      name: "files",
      value: {
        config: {
          type: "stdio",
          command: "npx",
          args: ["-y", "files-mcp"],
          env: { ROOT: "/repo", TOKEN: "a=b" },
        },
      },
    });
  });

  it("builds an http server from a URL and header lines, ignoring the stdio fields", () => {
    const form = createForm();
    form.setName("docs");
    form.setCommand("left-over");
    form.setTransport("http");
    form.setUrl("https://docs.example.com/mcp");
    form.setHeaders("Authorization: Bearer abc");

    expect(form.getState().disclosure).toEqual({ showCommandFields: false, showUrlFields: true });
    expect(form.submit()).toEqual({
      name: "docs",
      value: {
        config: {
          type: "http",
          url: "https://docs.example.com/mcp",
          headers: { Authorization: "Bearer abc" },
        },
      },
    });
  });

  it("shows no errors while typing and all of them after a failed submit", () => {
    const form = createForm();
    form.setName("bad name");

    expect(form.getState().errors).toEqual({});
    expect(form.submit()).toBeNull();
    expect(form.getState().errors).toEqual({ name: "invalid", command: "required" });

    form.setName("files");
    form.setCommand("npx");
    expect(form.getState().errors).toEqual({});
    expect(form.submit()).not.toBeNull();
  });

  it("rejects the reserved, duplicate, and empty names", () => {
    const form = createForm(["docs"]);
    form.setCommand("npx");

    form.setName("");
    form.submit();
    expect(form.getState().errors.name).toBe("required");
    form.setName("Paseo");
    expect(form.getState().errors.name).toBe("reserved");
    form.setName("docs");
    expect(form.getState().errors.name).toBe("duplicate");
  });

  it("rejects a URL that is not http(s) and malformed env or header lines", () => {
    const form = createForm();
    form.setName("docs");
    form.setTransport("sse");
    form.setUrl("ftp://docs.example.com");
    form.setHeaders("no separator");
    form.submit();

    expect(form.getState().errors).toEqual({ url: "invalid", headers: "invalid" });

    form.setTransport("stdio");
    form.setCommand("npx");
    form.setEnv("1BAD=x");
    expect(form.getState().errors).toEqual({ env: "invalid" });
  });

  it("seeds an edit from the stored server and keeps its enabled flag and alwaysLoad", () => {
    const form = openMcpServerForm({
      mode: "edit",
      otherNames: [],
      server: {
        name: "files",
        value: {
          enabled: false,
          config: { type: "stdio", command: "npx", args: ["files-mcp"], alwaysLoad: true },
        },
      },
    });

    expect(form.getState()).toMatchObject({
      mode: "edit",
      name: "files",
      transport: "stdio",
      command: "npx",
      args: "files-mcp",
    });

    form.setCommand("bunx");
    expect(form.submit()).toEqual({
      name: "files",
      value: {
        enabled: false,
        config: { type: "stdio", command: "bunx", args: ["files-mcp"], alwaysLoad: true },
      },
    });
  });

  it("does not notify or change after close", () => {
    const form = createForm();
    let notifications = 0;
    form.subscribe(() => {
      notifications += 1;
    });
    form.close();
    form.setName("late");

    expect(notifications).toBe(0);
    expect(form.getState().name).toBe("");
  });
});

describe("line parsers", () => {
  it("parses env and header lines and flags malformed ones", () => {
    expect(parseMcpEnv("A=1\n\nB=")).toEqual({ A: "1", B: "" });
    expect(parseMcpEnv("A")).toBeNull();
    expect(parseMcpHeaders("X-Key: v: w")).toEqual({ "X-Key": "v: w" });
    expect(parseMcpHeaders(": v")).toBeNull();
  });
});
