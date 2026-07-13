import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverPath = path.join(__dirname, "lorenzozanna-server.mjs");

const toolName = process.argv[2];
const toolArgs = process.argv[3] ? JSON.parse(process.argv[3]) : {};

if (!toolName) {
  console.error("Usage: node mcp/call-tool.mjs <tool-name> '{\"arg\":\"value\"}'");
  process.exit(2);
}

const child = spawn(process.execPath, [serverPath], {
  cwd: path.resolve(__dirname, ".."),
  stdio: ["pipe", "pipe", "inherit"],
});

let nextId = 1;
let buffer = "";
const pending = new Map();

child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  while (buffer.includes("\n")) {
    const index = buffer.indexOf("\n");
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;

    const message = JSON.parse(line);
    const waiter = pending.get(message.id);
    if (!waiter) continue;
    pending.delete(message.id);

    if (message.error) waiter.reject(new Error(JSON.stringify(message.error, null, 2)));
    else waiter.resolve(message.result);
  }
});

child.on("exit", (code) => {
  for (const waiter of pending.values()) {
    waiter.reject(new Error(`MCP server exited with code ${code}`));
  }
  pending.clear();
});

function request(method, params = {}) {
  const id = nextId++;
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function notify(method, params = {}) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
}

try {
  await request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: {
      name: "lorenzozanna-local-client",
      version: "0.1.0",
    },
  });
  notify("notifications/initialized");

  const result = await request("tools/call", {
    name: toolName,
    arguments: toolArgs,
  });

  const text = result?.content?.find((item) => item.type === "text")?.text;
  console.log(text ?? JSON.stringify(result, null, 2));
  child.stdin.end();
} catch (error) {
  console.error(error.message);
  child.kill();
  process.exit(1);
}
