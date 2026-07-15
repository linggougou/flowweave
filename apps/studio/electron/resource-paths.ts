import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type StudioResourcePaths = {
  electronNativeBindingPath: string;
  loginFixturePath: string;
};

export function resolveStudioResourcePaths({
  isPackaged,
  moduleUrl,
  resourcesPath,
}: {
  isPackaged: boolean;
  moduleUrl: string;
  resourcesPath?: string;
}): StudioResourcePaths {
  if (isPackaged) {
    if (!resourcesPath) {
      throw new Error("已打包应用缺少 resourcesPath");
    }

    return {
      electronNativeBindingPath: join(resourcesPath, "native", "better_sqlite3.node"),
      loginFixturePath: join(resourcesPath, "examples", "fixtures", "login.html"),
    };
  }

  const repoRoot = join(dirname(fileURLToPath(moduleUrl)), "../../..");
  return {
    electronNativeBindingPath: join(
      repoRoot,
      "apps/studio/dist-electron/native/better_sqlite3.node",
    ),
    loginFixturePath: join(repoRoot, "examples/fixtures/login.html"),
  };
}
