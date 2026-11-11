import { Inject, Injectable } from "@angular/core";
import { IPC_TUNNEL_SERVICE } from "../ipc/ipc-tunnel-service.token";
import { LoggerService } from "../../shared/services/logging/logger.service";
import { DataStore } from "../../shared/data-store/data-store";
import moment from "moment";
import { Subject } from "rxjs";
import _ from "lodash";
import Loki from "lokijs";
import { DesktopDataStore } from "../../shared/data-store/impl/desktop-data-store.service";
import { IpcChannelSub, IpcTunnelService } from "@elevate/shared/electron/ipc-tunnel";
import { BackupEvent } from "@elevate/shared/models/backup/backup-event.int";
import { IpcMessage } from "@elevate/shared/electron/ipc-message";
import { BackupMetadata } from "@elevate/shared/models/backup/backup-metadata.int";
import { RestoreEvent } from "@elevate/shared/models/backup/restore-event.int";
import { BackupChunk } from "@elevate/shared/models/backup/backup-chunk.int";
import { Channel } from "@elevate/shared/electron/channels.enum";
import { VersionsProvider } from "../../shared/services/versions/versions-provider";
import { DesktopVersionsProvider } from "../../shared/services/versions/impl/desktop-versions-provider.service";

@Injectable()
export class DesktopBackupService {
  public static readonly BACKUP_EXT: string = "elv";
  private static readonly BACKUP_CHUNK_SIZE: number = 10;

  constructor(
    @Inject(IPC_TUNNEL_SERVICE) public readonly ipcTunnelService: IpcTunnelService,
    @Inject(VersionsProvider) public readonly versionsProvider: DesktopVersionsProvider,
    @Inject(LoggerService) protected readonly logger: LoggerService,
    @Inject(DataStore) public readonly desktopDataStore: DesktopDataStore<object>
  ) {}

  private static formatBackupFilename(appVersion: string): string {
    return `${moment().format("Y.MM.DD-H.mm")}-v${appVersion}.${DesktopBackupService.BACKUP_EXT}`;
  }

  public backup(outputDirectory: string, appVersion: string): Subject<BackupEvent> {
    const backupStartTime = performance.now();
    const targetArchivePath = `${outputDirectory}/${DesktopBackupService.formatBackupFilename(appVersion)}`;

    // Backup collection with data only
    let savedDocs = 0;

    let totalDocs = 0;
    const collections = this.desktopDataStore.db.collections.filter(collection => {
      const docsInCol = collection.data.length;
      totalDocs += docsInCol;
      return docsInCol > 0;
    });

    const backupProgress$ = new Subject<BackupEvent>();

    this.logger.debug(
      `Start backup of ${totalDocs} documents across ${collections.length} non-empty collections. Destination file "${targetArchivePath}"`
    );

    // Send first progress event
    backupProgress$.next({ file: null, savedDocs: 0, totalDocs: totalDocs });

    // Trigger backup init. End is detected when all objects have been written and acknowledged by backup file
    this.ipcTunnelService.send<IpcMessage, string>(new IpcMessage(Channel.backupInit, targetArchivePath)).then(() => {
      // Append metadata header as first object of the file
      const metadata: BackupMetadata = { version: appVersion, totalDocs: totalDocs };
      const writeMetadataPromise = this.writeObject(metadata, false);

      // Once metadata header wrote, start sending collection using chunks
      writeMetadataPromise.then(() => {
        // Reduce each collection
        collections
          .reduce((prevCollectionPromise: Promise<void>, collection: Collection<any>, colIndex: number) => {
            return prevCollectionPromise.then(() => {
              // Cut collection in chunks
              const chunks = _.chunk(collection.data, DesktopBackupService.BACKUP_CHUNK_SIZE);

              this.logger.debug(`Backup "${collection.name}" collection using ${chunks.length} chunk(s)`);

              // Reduce each chunk and send them in tunnel for backup
              return chunks.reduce((previousPromise: Promise<void>, chunk: LokiObj[], chunkIndex: number) => {
                return previousPromise.then(() => {
                  const isLastChunk = collections.length === colIndex + 1 && chunks.length === chunkIndex + 1;

                  // Cleanup chunk before sending
                  chunk = chunk.map(doc => DataStore.cleanDbObject(_.cloneDeep(doc)));

                  // Create the chunk with the target collection to be used on restore
                  const bkpChunk: BackupChunk = { colName: collection.name, chk: chunk };

                  // Send chuck and notify UI!
                  return this.sendChunk(bkpChunk, isLastChunk).then(() => {
                    // When chuck saved update saved docs count
                    savedDocs += bkpChunk.chk.length;

                    // And send backup progress event
                    backupProgress$.next({
                      file: null,
                      savedDocs: savedDocs,
                      totalDocs: totalDocs
                    });
                    return Promise.resolve();
                  });
                });
              }, Promise.resolve());
            });
          }, Promise.resolve())
          .then(() => {
            this.logger.debug(`${totalDocs} documents have been sent and acknowledged for backup`);

            // Backup is finished. Send last event and complete
            backupProgress$.next({
              file: targetArchivePath,
              savedDocs: savedDocs,
              totalDocs: totalDocs
            });
            backupProgress$.complete();

            this.logger.debug(`Backup done in ${Math.round(performance.now() - backupStartTime)}ms`);
          });
      });
    });

    return backupProgress$;
  }

  /**
   * Restore a backup file. The live database is left untouched until every document announced by the backup
   * metadata has been read and staged: an incomplete, oversized or unreadable backup ends the progress with an
   * error and keeps the current data.
   */
  public restore(path: string): Subject<RestoreEvent> {
    const restoreStartTime = Date.now();
    const restoreProgress$ = new Subject<RestoreEvent>();

    let metadata: BackupMetadata = null;
    let finished = false;

    // Documents read so far, per collection, kept apart from the live database until the backup is complete
    const stagedDocs = new Map<string, object[]>();
    let readDocs = 0;

    /**
     * End the restore with an error, leaving the live data untouched.
     * When the reader is still streaming, reject its acknowledgement so it stops reading and closes the file.
     * Reader errors and end-of-file are already final on the reader side: acknowledge them.
     */
    const fail = (error: Error | string, stopReader: boolean = true): Promise<void> => {
      if (!finished) {
        finished = true;
        channelSubscription.unsubscribe();
        restoreProgress$.error(error);
      }
      return stopReader ? Promise.reject(error instanceof Error ? error.message : error) : Promise.resolve();
    };

    const channelSubscription = this.ipcTunnelService.on<[BackupMetadata | BackupChunk, number, Error, boolean], void>(
      Channel.restoreReadObj,
      (payload: [BackupMetadata | BackupChunk, number, Error, boolean]) => {
        const [obj, index, err, ended] = payload;

        if (finished) {
          return Promise.resolve();
        }

        // Error from the reader?
        if (err) {
          return fail(err, false);
        }

        // Try to read backup metadata
        if (index === 0) {
          // Verify backup metadata consistency
          const potentialMetadata = obj as BackupMetadata;

          if (potentialMetadata?.version && potentialMetadata?.totalDocs) {
            // Store header
            metadata = potentialMetadata;

            // Check if backup is compatible with current version installed
            if (!DataStore.isBackupCompatible(metadata.version)) {
              return fail(
                `Imported backup version ${metadata.version} is not compatible with current installed version.`
              );
            }
          } else {
            return fail("Unable to read backup meta data");
          }

          this.logger.debug("Found metadata", metadata);

          // Inform reader to send us next object
          return Promise.resolve();
        }

        // Reader reached the end of the file before every announced document was read
        if (ended) {
          const expected = metadata ? metadata.totalDocs : "?";
          return fail(
            `Backup is incomplete: ${readDocs} of ${expected} documents found. Nothing has been restored.`,
            false
          );
        }

        if (!metadata) {
          return fail("Unable to read backup meta data");
        }

        // If we are here then we got header metadata (= first object has been received and it was metadata)
        const backupChunk: BackupChunk = obj as BackupChunk;

        // We should have backup chunk every time. If not, stop reading and exit!
        if (!backupChunk || !backupChunk.colName || !Array.isArray(backupChunk.chk)) {
          return fail("Expected a backup chunk but got nothing");
        }

        // Stage the chunk documents
        if (!stagedDocs.has(backupChunk.colName)) {
          stagedDocs.set(backupChunk.colName, []);
        }
        stagedDocs.get(backupChunk.colName).push(...backupChunk.chk);
        readDocs += backupChunk.chk.length;

        if (readDocs > metadata.totalDocs) {
          return fail(`Backup has more documents than announced (${metadata.totalDocs}). Nothing has been restored.`);
        }

        // And notify of the progress
        restoreProgress$.next({ restoredDocs: readDocs, totalDocs: metadata.totalDocs } as RestoreEvent);

        this.logger.debug(`${backupChunk.chk.length} doc(s) read for "${backupChunk.colName}" collection.`);

        if (readDocs < metadata.totalDocs) {
          // Inform to read next object
          return Promise.resolve();
        }

        // Every announced document has been read: replace the live data
        finished = true;
        channelSubscription.unsubscribe();

        try {
          this.applyStagedDocs(stagedDocs);
        } catch (applyError) {
          restoreProgress$.error(applyError);
          return Promise.resolve();
        }

        // Save data store and complete :)
        return this.desktopDataStore
          .persist(true)
          .then(() => {
            restoreProgress$.complete();
            this.logger.info(`Restored in ${Math.round(Date.now() - restoreStartTime)}ms`);

            // Set "backup version" as existing version to apply required migrations between backup and current version installed
            return this.versionsProvider.setExistingVersion(metadata.version);
          })
          .catch(persistError => {
            restoreProgress$.error(persistError);
          });
      }
    );

    // Trigger restore init
    this.ipcTunnelService
      .send<IpcMessage, string>(new IpcMessage(Channel.restoreInit, path))
      .then(() => {
        this.logger.debug("Restore initiated");
      })
      .catch(initError => fail(initError, false));

    return restoreProgress$;
  }

  /**
   * Replace every live collection with the staged documents.
   * Documents are first inserted in a throwaway in-memory database carrying the live unique keys and indices,
   * so an invalid backup (e.g. duplicate ids) throws before the live database is touched. The live collections are
   * then wiped and filled synchronously; if that still fails, their previous documents are put back.
   */
  private applyStagedDocs(stagedDocs: Map<string, object[]>): void {
    const db = this.desktopDataStore.db;

    const collectionOptions = (name: string): Partial<CollectionOptions<any>> => {
      const live = db.getCollection(name);
      return live
        ? { unique: [...((live as any).uniqueNames || [])], indices: Object.keys((live as any).binaryIndices || {}) }
        : {};
    };

    // 1. Validate on a staging database
    const stagingDb = new Loki("elevate-restore-staging");
    stagedDocs.forEach((docs, name) => {
      stagingDb.addCollection(name, collectionOptions(name)).insert(docs.map(doc => ({ ...doc })));
    });

    // 2. Keep the current documents (shallow copies, without Loki fields) to roll back if applying fails
    const previousDocs = db.collections.map(collection => ({
      name: collection.name,
      docs: collection.data.map(doc => DataStore.cleanDbObject({ ...doc }))
    }));

    const replaceAll = (docsByCollection: Map<string, object[]>): void => {
      db.collections.forEach(collection => {
        collection.findAndRemove();
        // Keep index and unique key definitions: they also guard the documents inserted below
        collection.clear();
      });
      docsByCollection.forEach((docs, name) => {
        const collection = db.getCollection(name) || db.addCollection(name);
        if (docs.length) {
          collection.insert(docs);
        }
      });
    };

    try {
      replaceAll(stagedDocs);
    } catch (applyError) {
      this.logger.error("Restore failed while applying the backup, putting previous data back", applyError);
      replaceAll(new Map<string, object[]>(previousDocs.map(previous => [previous.name, previous.docs as object[]])));
      throw applyError;
    }
  }

  public sendChunk(bkpChunk: BackupChunk, isLastChunk: boolean): Promise<void> {
    return this.writeObject(bkpChunk, isLastChunk);
  }

  public writeObject(obj: object, isLastObj: boolean): Promise<void> {
    const ipcMessage = new IpcMessage(Channel.backupWriteObj, obj, isLastObj);
    return this.ipcTunnelService.send<IpcMessage, void>(ipcMessage);
  }
}
