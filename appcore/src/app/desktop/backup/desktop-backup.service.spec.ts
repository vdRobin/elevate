import { DesktopBackupService } from "./desktop-backup.service";
import { IpcTunnelService } from "@elevate/shared/electron/ipc-tunnel";
import { IpcMessage } from "@elevate/shared/electron/ipc-message";
import { Channel } from "@elevate/shared/electron/channels.enum";
import { BackupEvent } from "@elevate/shared/models/backup/backup-event.int";
import { LoggerService } from "../../shared/services/logging/logger.service";
import { DesktopDataStore } from "../../shared/data-store/impl/desktop-data-store.service";
import { DesktopVersionsProvider } from "../../shared/services/versions/impl/desktop-versions-provider.service";

describe("DesktopBackupService", () => {
  const docs = (count: number) => Array.from({ length: count }, (_, i) => ({ id: i, $loki: i + 1, meta: {} }));

  const createService = (send: (message: IpcMessage) => Promise<any>): DesktopBackupService => {
    const ipcTunnelService = { send } as unknown as IpcTunnelService;
    const logger = { debug: () => null, error: () => null } as unknown as LoggerService;
    const dataStore = {
      db: { collections: [{ name: "activities", data: docs(25) }] }
    } as unknown as DesktopDataStore<object>;
    return new DesktopBackupService(ipcTunnelService, {} as DesktopVersionsProvider, logger, dataStore);
  };

  const collect = (
    backup$: ReturnType<DesktopBackupService["backup"]>
  ): Promise<{ events: BackupEvent[]; error: any; completed: boolean }> =>
    new Promise(resolve => {
      const events: BackupEvent[] = [];
      backup$.subscribe({
        next: event => events.push(event),
        error: error => resolve({ events, error, completed: false }),
        complete: () => resolve({ events, error: null, completed: true })
      });
    });

  it("should complete with the backup file when every write succeeds", async () => {
    const service = createService(() => Promise.resolve());

    const result = await collect(service.backup("/backups", "7.3.0"));

    expect(result.completed).toBe(true);
    const lastEvent = result.events[result.events.length - 1];
    expect(lastEvent.file).toMatch(/^\/backups\/.*-v7\.3\.0\.elv$/);
    expect(lastEvent.savedDocs).toEqual(25);
  });

  it("should error the progress when the backup file can't be initialised", async () => {
    const initError = new Error("EACCES: permission denied");
    const service = createService(message =>
      message.channel === Channel.backupInit ? Promise.reject(initError) : Promise.resolve()
    );

    const result = await collect(service.backup("/read-only", "7.3.0"));

    expect(result.completed).toBe(false);
    expect(result.error).toBe(initError);
  });

  it("should error the progress when writing a chunk fails", async () => {
    const writeError = new Error("ENOSPC: no space left on device");
    let writes = 0;
    const service = createService(message => {
      if (message.channel === Channel.backupWriteObj) {
        writes++;
        // 1st write is the metadata header, 2nd the first chunk: fail on the second chunk
        return writes === 3 ? Promise.reject(writeError) : Promise.resolve();
      }
      return Promise.resolve();
    });

    const result = await collect(service.backup("/backups", "7.3.0"));

    expect(result.completed).toBe(false);
    expect(result.error).toBe(writeError);
    expect(result.events[result.events.length - 1].savedDocs).toEqual(10);
  });
});
