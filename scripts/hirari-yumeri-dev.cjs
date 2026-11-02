const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const scope = "@mirelia/";
const root = path.resolve(process.env.HIRARI_WORKSPACE ?? process.cwd());
const dirs = new Map();
const generations = new Map();
const loaded = new Map();
const sourceExtensions = [".ts", ".tsx", ".mts", ".cts", ".jsx", ".js", ".mjs", ".cjs"];

function packageDirectory(name) {
  if (dirs.has(name)) return dirs.get(name);
  let result;
  try { result = path.dirname(require.resolve(`${name}/package.json`, { paths: [root] })); } catch { result = null; }
  dirs.set(name, result);
  return result;
}
function sourceEntry(directory) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
    for (const candidate of [pkg.dev, pkg.module, pkg.main]) {
      if (candidate && fs.existsSync(path.join(directory, candidate))) return path.join(directory, candidate);
    }
  } catch {}
  return null;
}
function inWorkspace(file) { return file === root || file.startsWith(`${root}${path.sep}`); }
function packageFile(file) { return inWorkspace(file) && file.startsWith(path.join(root, "packages") + path.sep); }
function resolveFrom(base) {
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  const plain = base.replace(/\.(js|mjs|cjs|jsx)$/, "");
  for (const ext of sourceExtensions) if (fs.existsSync(plain + ext)) return plain + ext;
  for (const ext of sourceExtensions) { const index = path.join(base, `index${ext}`); if (fs.existsSync(index)) return index; }
  return null;
}
function versioned(file, generation) { return { url: `${pathToFileURL(file).href}?hirari=${generation}`, format: /\.(cjs|cts)$/.test(file) ? "commonjs" : "module" }; }
module.exports = {
  name: "@mirelia/hirari-dev",
  extensions: [],
  match: () => false,
  resolve(specifier, importer) {
    if (typeof specifier !== "string" || !specifier || specifier.startsWith("node:")) return null;
    if (specifier.startsWith(scope)) {
      const name = specifier.split("/").slice(0, 2).join("/");
      if (specifier !== name) return null;
      const directory = packageDirectory(name);
      if (!directory) return null;
      if (importer && packageFile(importer)) {
        const existing = loaded.get(directory);
        return existing ? { url: existing, format: "module" } : versioned(sourceEntry(directory), 0);
      }
      const entry = sourceEntry(directory);
      if (!entry) return null;
      const generation = (generations.get(directory) ?? 0) + 1;
      generations.set(directory, generation);
      const result = versioned(entry, generation);
      loaded.set(directory, result.url);
      return result;
    }
    if (!importer || !inWorkspace(importer) || !specifier.startsWith("./") && !specifier.startsWith("../")) return null;
    let directory = importer;
    while (directory.startsWith(path.join(root, "packages")) && directory !== path.dirname(directory)) {
      const candidate = path.join(directory, "package.json");
      if (fs.existsSync(candidate)) break;
      directory = path.dirname(directory);
    }
    const generation = generations.get(directory);
    if (!generation) return null;
    const file = resolveFrom(path.resolve(path.dirname(importer), specifier));
    return file ? versioned(file, generation) : null;
  },
};
