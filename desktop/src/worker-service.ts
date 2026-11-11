import { inject, singleton } from "tsyringe";
import { AppService } from "./app-service";
import { Worker } from "worker_threads";
import { WorkerType } from "./enum/worker-type.enum";
import { deserializeError } from "serialize-error";

@singleton()
export class WorkerService {
  constructor(@inject(AppService) protected readonly appService: AppService) {}

  protected getWorkerScriptPath(workerType: WorkerType): string {
    return this.appService.isPackaged
      ? `${this.appService.getResourceFolder()}/app.asar.unpacked/dist/workers/${workerType}.worker.js`
      : `${__dirname}/workers/${workerType}.worker.js`;
  }

  /**
   * Run a worker and resolve with the data it posts, or reject with the error it posts.
   * Also rejects when the worker fails to load, throws, or exits before posting a result,
   * so a crashed worker can't leave a sync or recalculation waiting forever.
   */
  public exec<P, R>(workerType: WorkerType, params: P): Promise<R> {
    const workerScriptPath = this.getWorkerScriptPath(workerType);
    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (settleFn: () => void): void => {
        if (!settled) {
          settled = true;
          settleFn();
        }
      };

      const worker = new Worker(workerScriptPath, {
        workerData: params
      });

      worker.on("message", result => {
        settle(() => (result?.error ? reject(deserializeError(result.error)) : resolve(result?.data)));
        // The result is in: free the worker thread
        worker.terminate().catch(() => null);
      });

      worker.on("error", error => {
        settle(() => reject(error));
      });

      worker.on("exit", exitCode => {
        settle(() => reject(new Error(`Worker "${workerType}" exited with code ${exitCode} before posting a result`)));
      });
    });
  }
}
