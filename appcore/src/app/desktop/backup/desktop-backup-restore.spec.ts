import Loki from "lokijs";
import { DesktopBackupService } from "./desktop-backup.service";
import { IpcTunnelService } from "@elevate/shared/electron/ipc-tunnel";
import { BackupMetadata } from "@elevate/shared/models/backup/backup-metadata.int";
import { BackupChunk } from "@elevate/shared/models/backup/backup-chunk.int";
import { RestoreEvent } from "@elevate/shared/models/backup/restore-event.int";
import { LoggerService } from "../../shared/services/logging/logger.service";
import { DesktopDataStore } from "../../shared/data-store/impl/desktop-data-store.service";
import { DesktopVersionsProvider } from "../../shared/services/versions/impl/desktop-versions-provider.service";

type ReadPayload = [BackupMetadata | BackupChunk, number, Error, boolean];

describe("DesktopBackupService restore", () => {
  let db: Loki;
  let persistSpy: jasmine.Spy;
  let setExistingVersionSpy: jasmine.Spy;
  let unsubscribeSpy: jasmine.Spy;
  let readHandler: (payload: ReadPayload) => Promise<void>;
  let service: DesktopBackupService;

  const liveDocs = (name: string) =>
    db.getCollection(name).data.map(doc => {
      const { $loki, meta, ...rest } = doc as any;
      return rest;
    });

  beforeEach(() => {
    // Live database: one activity and one athlete document
    db = new Loki("live");
    db.addCollection<any>("activities", { unique: ["id"], indices: ["startTime"] }).insert([
      { id: 1, name: "Live ride" }
    ]);
    db.addCollection<any>("athlete").insert([{ firstName: "Live" }]);

    persistSpy = jasmine.createSpy("persist").and.returnValue(Promise.resolve());
    setExistingVersionSpy = jasmine.createSpy("setExistingVersion").and.returnValue(Promise.resolve());
    unsubscribeSpy = jasmine.createSpy("unsubscribe");

    const ipcTunnelService = {
      on: (channel, handler) => {
        readHandler = handler;
        return { unsubscribe: unsubscribeSpy };
      },
      send: () => Promise.resolve()
    } as unknown as IpcTunnelService;
    const logger = { debug: () => null, info: () => null, error: () => null } as unknown as LoggerService;
    const dataStore = { db: db, persist: persistSpy } as unknown as DesktopDataStore<object>;
    const versionsProvider = { setExistingVersion: setExistingVersionSpy } as unknown as DesktopVersionsProvider;

    service = new DesktopBackupService(ipcTunnelService, versionsProvider, logger, dataStore);
  });

  const runRestore = async (
    payloads: ReadPayload[]
  ): Promise<{ events: RestoreEvent[]; error: any; completed: boolean; acks: string[] }> => {
    const events: RestoreEvent[] = [];
    // How each object was acknowledged to the reader: "ok" to continue, "stop" to make it close the file
    const acks: string[] = [];
    let error = null;
    let completed = false;
    service.restore("/backups/test.elv").subscribe({
      next: event => events.push(event),
      error: err => (error = err),
      complete: () => (completed = true)
    });
    for (const payload of payloads) {
      await readHandler(payload).then(
        () => acks.push("ok"),
        () => acks.push("stop")
      );
    }
    return { events, error, completed, acks };
  };

  const metadata = (totalDocs: number, version = "7.3.0"): ReadPayload => [{ version, totalDocs }, 0, null, false];
  const chunk = (index: number, colName: string, chk: object[]): ReadPayload => [{ colName, chk }, index, null, false];
  const ended = (index: number): ReadPayload => [null, index, null, true];

  it("should replace the live data once every announced document is read", async () => {
    const result = await runRestore([
      metadata(4),
      chunk(1, "activities", [
        { id: 10, name: "Restored ride" },
        { id: 11, name: "Restored run" }
      ]),
      chunk(2, "athlete", [{ firstName: "Restored" }]),
      chunk(3, "streams", [{ activityId: 10, deflated: "abc" }])
    ]);

    expect(result.error).toBeNull();
    expect(result.completed).toBe(true);
    expect(result.events.map(event => event.restoredDocs)).toEqual([2, 3, 4]);
    expect(liveDocs("activities").map(doc => doc.id)).toEqual([10, 11]);
    expect(liveDocs("athlete")).toEqual([{ firstName: "Restored" }]);
    expect(liveDocs("streams")).toEqual([{ activityId: 10, deflated: "abc" }]);
    expect(persistSpy).toHaveBeenCalledTimes(1);
    expect(setExistingVersionSpy).toHaveBeenCalledWith("7.3.0");
    expect(unsubscribeSpy).toHaveBeenCalled();
    // Unique key still enforced on the live collection
    expect(() => db.getCollection("activities").insert({ id: 10 })).toThrow();
  });

  it("should keep the live data when the backup ends before every announced document", async () => {
    const result = await runRestore([
      metadata(3),
      chunk(1, "activities", [{ id: 10 }]),
      chunk(2, "athlete", [{ firstName: "Restored" }]),
      ended(3)
    ]);

    expect(result.completed).toBe(false);
    expect(String(result.error)).toContain("Backup is incomplete: 2 of 3");
    expect(result.acks).toEqual(["ok", "ok", "ok", "ok"]);
    expect(liveDocs("activities")).toEqual([{ id: 1, name: "Live ride" }]);
    expect(liveDocs("athlete")).toEqual([{ firstName: "Live" }]);
    expect(persistSpy).not.toHaveBeenCalled();
    expect(setExistingVersionSpy).not.toHaveBeenCalled();
    expect(unsubscribeSpy).toHaveBeenCalled();
  });

  it("should keep the live data when the backup has more documents than announced", async () => {
    const result = await runRestore([metadata(1), chunk(1, "activities", [{ id: 10 }, { id: 11 }])]);

    expect(result.completed).toBe(false);
    expect(String(result.error)).toContain("more documents than announced");
    expect(result.acks).toEqual(["ok", "stop"]);
    expect(liveDocs("activities")).toEqual([{ id: 1, name: "Live ride" }]);
    expect(persistSpy).not.toHaveBeenCalled();
  });

  it("should keep the live data when the backup holds duplicate unique keys", async () => {
    const result = await runRestore([metadata(2), chunk(1, "activities", [{ id: 10 }, { id: 10 }])]);

    expect(result.completed).toBe(false);
    expect(result.error).toBeTruthy();
    expect(liveDocs("activities")).toEqual([{ id: 1, name: "Live ride" }]);
    expect(liveDocs("athlete")).toEqual([{ firstName: "Live" }]);
    expect(persistSpy).not.toHaveBeenCalled();
  });

  it("should keep the live data when the reader fails midway", async () => {
    const readError = new Error("Unexpected end of gzip data");
    const result = await runRestore([metadata(3), chunk(1, "activities", [{ id: 10 }]), [null, 2, readError, false]]);

    expect(result.completed).toBe(false);
    expect(result.error).toBe(readError);
    expect(result.acks).toEqual(["ok", "ok", "ok"]);
    expect(liveDocs("activities")).toEqual([{ id: 1, name: "Live ride" }]);
    expect(persistSpy).not.toHaveBeenCalled();
    expect(unsubscribeSpy).toHaveBeenCalled();
  });

  it("should refuse a backup from an incompatible version without touching the live data", async () => {
    const result = await runRestore([metadata(1, "6.0.0"), chunk(1, "activities", [{ id: 10 }])]);

    expect(result.completed).toBe(false);
    expect(String(result.error)).toContain("not compatible");
    expect(result.acks[0]).toEqual("stop");
    expect(liveDocs("activities")).toEqual([{ id: 1, name: "Live ride" }]);
  });
});
