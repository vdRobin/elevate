import { Inject, Injectable } from "@angular/core";
import { AppLoadService } from "../app-load.service";
import { DataStore } from "../../shared/data-store/data-store";
import { sleep } from "@elevate/shared/tools/sleep";

@Injectable()
export class ExtensionLoadService extends AppLoadService {
  protected readonly SPLASH_SCREEN_MIN_TIME_DISPLAYED: number = 750;

  constructor(@Inject(DataStore) protected readonly dataStore: DataStore<object>) {
    super(dataStore);
  }

  /**
   * Wait for the database to be loaded, and keep the splash screen for a minimum time.
   */
  public loadApp(): Promise<void> {
    return Promise.all([super.loadApp(), sleep(this.SPLASH_SCREEN_MIN_TIME_DISPLAYED)]).then(() => undefined);
  }
}
