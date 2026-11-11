import { ReplaySubject } from "rxjs";
import { ExtensionLoadService } from "./extension-load.service";
import { DataStore, DbEvent } from "../../shared/data-store/data-store";

describe("ExtensionLoadService", () => {
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  it("should wait for the database to be loaded, not only for the splash screen delay", async () => {
    // Given
    const dbEvent$ = new ReplaySubject<DbEvent>();
    const loadService = new ExtensionLoadService({ dbEvent$ } as unknown as DataStore<object>);
    let loaded = false;

    // When
    loadService.loadApp().then(() => (loaded = true));
    await wait(900); // Longer than the minimum splash screen time

    // Then: still waiting for the database
    expect(loaded).toBe(false);

    // When the database is loaded
    dbEvent$.next(DbEvent.LOADED);
    await wait(10);

    // Then
    expect(loaded).toBe(true);
  });

  it("should keep the splash screen for its minimum time when the database loads quickly", async () => {
    // Given
    const dbEvent$ = new ReplaySubject<DbEvent>();
    dbEvent$.next(DbEvent.LOADED);
    const loadService = new ExtensionLoadService({ dbEvent$ } as unknown as DataStore<object>);
    let loaded = false;

    // When
    loadService.loadApp().then(() => (loaded = true));
    await wait(100);

    // Then
    expect(loaded).toBe(false);
    await wait(800);
    expect(loaded).toBe(true);
  });

  it("should fail to load when the database fails to load", async () => {
    // Given
    const dbEvent$ = new ReplaySubject<DbEvent>();
    const loadService = new ExtensionLoadService({ dbEvent$ } as unknown as DataStore<object>);
    const loadError = new Error("chrome.storage unavailable");

    // When
    const promise = loadService.loadApp();
    dbEvent$.error(loadError);

    // Then
    await expect(promise).rejects.toBe(loadError);
  });
});
