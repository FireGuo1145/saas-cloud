/**
 * Prints the rendered sidebar for each route, without screenshots.
 * Usage: node scripts/sidebar-check.mjs <baseUrl> <path> [path...]
 */
import { spawn } from "node:child_process";

const [base = "http://127.0.0.1:3001", ...paths] = process.argv.slice(2);
const username = process.env.ADMIN_USERNAME;
const password = process.env.ADMIN_PASSWORD;
if (!username || !password) throw new Error("Set ADMIN_USERNAME and ADMIN_PASSWORD");

const port = 9336;
const chrome = spawn("google-chrome-stable", [
  "--headless=new", "--disable-gpu", "--no-sandbox", `--remote-debugging-port=${port}`,
  "--window-size=1280,760", "--user-data-dir=/tmp/jpg-sidebar-profile", "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function json(pathname) {
  for (let attempt = 0; attempt < 50; attempt++) {
    try { return await (await fetch(`http://127.0.0.1:${port}${pathname}`)).json(); } catch { await sleep(200); }
  }
  throw new Error("Chrome did not start");
}
const socket = new WebSocket((await json("/json/version")).webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
let id = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const messageId = ++id;
  pending.set(messageId, (message) => message.error ? reject(new Error(message.error.message)) : resolve(message.result));
  socket.send(JSON.stringify({ id: messageId, method, params, sessionId }));
});
const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, sessionId);
const evaluate = async (expression) => {
  try { return (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId)).result?.value; }
  catch { return undefined; }
};
const goto = async (path) => { await send("Page.navigate", { url: `${base}${path}` }, sessionId); await sleep(4000); };

await goto("/login");
await evaluate(`(async () => {
  const set = (element, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); };
  const inputs = [...document.querySelectorAll("input")];
  set(inputs.find((input) => input.type !== "password"), ${JSON.stringify(username)});
  set(inputs.find((input) => input.type === "password"), ${JSON.stringify(password)});
  await new Promise((resolve) => setTimeout(resolve, 300));
  [...document.querySelectorAll("button")].find((button) => button.type === "submit")?.click();
  await new Promise((resolve) => setTimeout(resolve, 3000));
})()`);

for (const path of paths) {
  await goto(path);
  const state = await evaluate(`({ path: location.pathname, sidebar: document.querySelector("aside")?.innerText?.replace(/\\n+/g, " | ") })`);
  console.log(`${path.padEnd(24)} -> ${state?.path} :: ${state?.sidebar}`);
}

socket.close();
chrome.kill("SIGKILL");
process.exit(0);
