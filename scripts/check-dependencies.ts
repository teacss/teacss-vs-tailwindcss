import { argv } from "node:process";
import { fileURLToPath } from "node:url";
import { DEPENDS_ON, type Problem, readWorkspace, runCheck, WORKSPACE_SCOPE, type WorkspacePackage } from "./workspace.ts";

const WORKSPACE_PROTOCOL = "workspace:";

function workspaceDependencies(pkg: WorkspacePackage): [string, string][] {
  return Object.entries({ ...pkg.manifest.dependencies, ...pkg.manifest.devDependencies }).filter(([name]) => name.startsWith(WORKSPACE_SCOPE));
}

export function checkDependencies(root: string): Problem[] {
  const packages = readWorkspace(root);
  const byName = new Map(packages.map((pkg) => [pkg.manifest.name, pkg]));
  const problems: Problem[] = [];
  for (const pkg of packages) {
    if (pkg.layer === undefined) continue;
    const path = `${pkg.dir}/package.json`;
    let products = 0;
    for (const [name, range] of workspaceDependencies(pkg)) {
      const target = byName.get(name);
      if (!range.startsWith(WORKSPACE_PROTOCOL)) problems.push({ path, message: `${name} must use the workspace protocol, found "${range}"` });
      if (target === undefined) {
        problems.push({ path, message: `${name} is not a workspace package` });
        continue;
      }
      if (target.layer === undefined) continue;
      if (target.layer === "product") products++;
      if (!DEPENDS_ON[pkg.layer].includes(target.layer)) problems.push({ path, message: `${pkg.layer} "${pkg.manifest.name}" may not depend on ${target.layer} "${name}"; ${pkg.layer} depends on ${DEPENDS_ON[pkg.layer].join(", ") || "nothing in the workspace"}` });
    }
    if (pkg.layer === "shell" && products !== 1) problems.push({ path, message: `a shell depends on exactly one product, found ${products}` });
  }
  return problems;
}

if (argv[1] === fileURLToPath(import.meta.url)) runCheck("dependencies", checkDependencies(argv[2] ?? "."));
