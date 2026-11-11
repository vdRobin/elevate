import fs from "fs";
import os from "os";
import path from "path";
import { WorkerService } from "./worker-service";
import { WorkerType } from "./enum/worker-type.enum";
import { AppService } from "./app-service";

class ScriptWorkerService extends WorkerService {
  constructor(private readonly scriptPath: string) {
    super({ isPackaged: false } as AppService);
  }

  protected getWorkerScriptPath(): string {
    return this.scriptPath;
  }
}

describe("WorkerService", () => {
  let tmpDir: string;

  const workerScript = (name: string, source: string): string => {
    const scriptPath = path.join(tmpDir, `${name}.js`);
    fs.writeFileSync(scriptPath, source);
    return scriptPath;
  };

  const exec = (scriptPath: string): Promise<unknown> =>
    new ScriptWorkerService(scriptPath).exec(WorkerType.ACTIVITY_COMPUTE, { input: 21 });

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "elevate-worker-spec-"));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should resolve with the data posted by the worker", async () => {
    const scriptPath = workerScript(
      "posts-data",
      `const { parentPort, workerData } = require("worker_threads");
       parentPort.postMessage({ data: workerData.input * 2 });`
    );

    await expect(exec(scriptPath)).resolves.toEqual(42);
  });

  it("should reject with the error posted by the worker", async () => {
    const scriptPath = workerScript(
      "posts-error",
      `const { parentPort } = require("worker_threads");
       parentPort.postMessage({ error: { name: "Error", message: "compute failed" } });`
    );

    await expect(exec(scriptPath)).rejects.toThrow("compute failed");
  });

  it("should reject when the worker throws while loading", async () => {
    const scriptPath = workerScript("throws", `throw new Error("boom at load time");`);

    await expect(exec(scriptPath)).rejects.toThrow("boom at load time");
  });

  it("should reject when the worker exits with a non-zero code before posting", async () => {
    const scriptPath = workerScript("exits-non-zero", `process.exit(2);`);

    await expect(exec(scriptPath)).rejects.toThrow("exited with code 2");
  });

  it("should reject when the worker exits cleanly without posting a result", async () => {
    const scriptPath = workerScript("exits-silently", `// does nothing`);

    await expect(exec(scriptPath)).rejects.toThrow("exited with code 0");
  });
});
