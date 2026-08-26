import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const siteRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const moduleRoot = join(siteRoot, "modules");

test("domain and application layers retain inward-only dependencies", async () => {
  const files = await sourceFiles(moduleRoot);
  const violations: string[] = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const imports = importSpecifiers(source);
    const label = relative(siteRoot, file);
    if (file.includes("/domain/")) {
      for (const specifier of imports) {
        if (/\/(application|infrastructure|presentation)\//.test(specifier) || /^(react|next|drizzle-orm)(\/|$)/.test(specifier)) {
          violations.push(`${label} -> ${specifier}`);
        }
      }
    }
    if (file.includes("/application/")) {
      for (const specifier of imports) {
        if (/\/(infrastructure|presentation)\//.test(specifier) || /(^|\/)db\/schema/.test(specifier) || /^(react|next|drizzle-orm)(\/|$)/.test(specifier)) {
          violations.push(`${label} -> ${specifier}`);
        }
      }
    }
  }
  assert.deepEqual(violations, [], `Layer boundary violations:\n${violations.join("\n")}`);
});

test("production module graph has no circular source dependencies", async () => {
  const files = await sourceFiles(moduleRoot);
  const known = new Set(files);
  const graph = new Map<string, string[]>();
  for (const file of files) {
    const imports = importSpecifiers(await readFile(file, "utf8"))
      .map((specifier) => resolveSourceImport(file, specifier, known))
      .filter((value): value is string => value !== null);
    graph.set(file, imports);
  }
  const active = new Set<string>();
  const complete = new Set<string>();
  const stack: string[] = [];
  const cycles: string[] = [];
  function visit(file: string) {
    if (complete.has(file)) return;
    if (active.has(file)) {
      const start = stack.indexOf(file);
      cycles.push([...stack.slice(start), file].map((item) => relative(siteRoot, item)).join(" -> "));
      return;
    }
    active.add(file); stack.push(file);
    for (const dependency of graph.get(file) ?? []) visit(dependency);
    stack.pop(); active.delete(file); complete.add(file);
  }
  for (const file of files) visit(file);
  assert.deepEqual(cycles, [], `Circular dependencies:\n${cycles.join("\n")}`);
});

test("HTTP and UI source cannot bypass repositories with direct schema or ORM access", async () => {
  const files = [
    ...(await sourceFiles(join(siteRoot, "app"))),
    ...(await sourceFiles(join(siteRoot, "components"))),
  ];
  const violations: string[] = [];
  for (const file of files) {
    for (const specifier of importSpecifiers(await readFile(file, "utf8"))) {
      if (specifier === "drizzle-orm" || /(^|\/)db\/schema(?:\.ts)?$/.test(specifier)) violations.push(`${relative(siteRoot, file)} -> ${specifier}`);
    }
  }
  assert.deepEqual(violations, [], `Direct persistence access outside infrastructure:\n${violations.join("\n")}`);
});

test("production source is free of retired branding, fake launch data and development form responses", async () => {
  const files = (await Promise.all(["app", "components", "lib", "modules"].map((directory) => sourceFiles(join(siteRoot, directory))))).flat();
  const source = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
  assert.doesNotMatch(source, /AI-Magnet|AI Magnet|ai-magnet/i);
  assert.doesNotMatch(source, /(?:www\.)?example\.com|Legal entity to be configured|ABN to be configured|1300 000 000/i);
  assert.doesNotMatch(source, /delivered:\s*false|development form|development adapter|stores nothing and sends nothing/i);
  assert.doesNotMatch(source, /\b(?:sk_live|sk_test|whsec)_[A-Za-z0-9_]{8,}\b/);
});

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx", ".mts"].includes(extname(entry.name)) ? [path] : [];
  }));
  return nested.flat().sort();
}

function importSpecifiers(source: string): string[] {
  const imports: string[] = [];
  const pattern = /(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) imports.push(match[1]);
  for (const match of source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) imports.push(match[1]);
  return imports;
}

function resolveSourceImport(file: string, specifier: string, known: Set<string>): string | null {
  const base = specifier.startsWith("@/") ? join(siteRoot, specifier.slice(2)) : specifier.startsWith(".") ? resolve(dirname(file), specifier) : null;
  if (!base) return null;
  const candidates = extname(base) ? [base] : [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")];
  return candidates.find((candidate) => known.has(candidate)) ?? null;
}
