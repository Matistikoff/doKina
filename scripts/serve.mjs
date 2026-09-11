import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { programPayloads } from "./program-payloads.mjs";

const root = new URL("../site/", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const port = Number(process.env.PORT || 4173);
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const file = normalize(join(root, relative));

  if (!file.startsWith(normalize(root))) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  try {
    if (pathname === "/program-index.json" || /^\/movie-details\/[a-f0-9]{64}\.json$/u.test(pathname)) {
      const program = JSON.parse(await readFile(join(root, "program.json"), "utf8"));
      const { index, details } = programPayloads(program);
      const body = pathname === "/program-index.json" ? JSON.stringify(index) : details.get(pathname);
      if (!body) throw new Error("Unknown movie detail");
      response.writeHead(200, { "Content-Type": types[".json"], "Cache-Control": "no-store" }).end(body);
      return;
    }
    const info = await stat(file);
    if (!info.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
      "Cache-Control": extname(file) === ".json" ? "no-store" : "no-cache",
    });
    createReadStream(file).pipe(response);
  } catch {
    if (/^\/film\/[^/]+\/?$/u.test(pathname)) {
      response.writeHead(200, { "Content-Type": types[".html"], "Cache-Control": "no-cache" });
      createReadStream(join(root, "index.html")).pipe(response);
      return;
    }
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`doKina.sk: http://127.0.0.1:${port}`);
});
