import { TestBed } from "@angular/core/testing";
import { HttpClientTestingModule, HttpTestingController } from "@angular/common/http/testing";
import { CoreModule } from "../../core/core.module";
import { SharedModule } from "../../shared/shared.module";
import { TargetModule } from "../../shared/modules/target/desktop-target.module";
import { IPC_TUNNEL_SERVICE } from "../ipc/ipc-tunnel-service.token";
import { IpcRendererTunnelServiceMock } from "../ipc/ipc-renderer-tunnel-service.mock";
import { DataStore } from "../../shared/data-store/data-store";
import { TestingDataStore } from "../../shared/data-store/testing-datastore.service";
import { MapTokenService } from "./map-token.service";
import { environment } from "../../../environments/environment";
import { UserSettingsService } from "../../shared/services/user-settings/user-settings.service";
import { UserSettings } from "@elevate/shared/models/user-settings/user-settings.namespace";
import _ from "lodash";
import DesktopUserSettings = UserSettings.DesktopUserSettings;

describe("MapTokenService", () => {
  let mapTokenService: MapTokenService;
  let userSettingsService: UserSettingsService;
  let httpTestingController: HttpTestingController;
  const initialBackendBaseUrl = environment.backendBaseUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CoreModule, SharedModule, TargetModule, HttpClientTestingModule],
      providers: [
        { provide: IPC_TUNNEL_SERVICE, useClass: IpcRendererTunnelServiceMock },
        { provide: DataStore, useClass: TestingDataStore }
      ]
    });

    mapTokenService = TestBed.inject(MapTokenService);
    userSettingsService = TestBed.inject(UserSettingsService);
    httpTestingController = TestBed.inject(HttpTestingController);
    environment.backendBaseUrl = null;
  });

  afterEach(() => {
    environment.backendBaseUrl = initialBackendBaseUrl;
    httpTestingController.verify();
  });

  it("should use the user defined map token", done => {
    // Given
    const userSettings: DesktopUserSettings = _.cloneDeep(DesktopUserSettings.DEFAULT_MODEL);
    userSettings.mapToken = " pk.user-token ";
    spyOn(userSettingsService, "fetch").and.returnValue(Promise.resolve(userSettings));

    // When
    mapTokenService.get().then(token => {
      // Then
      expect(token).toEqual("pk.user-token");
      httpTestingController.expectNone(() => true);
      done();
    });
  });

  it("should use a fallback token without requesting the backend when none is configured", done => {
    // Given
    const userSettings: DesktopUserSettings = _.cloneDeep(DesktopUserSettings.DEFAULT_MODEL);
    userSettings.mapToken = null;
    spyOn(userSettingsService, "fetch").and.returnValue(Promise.resolve(userSettings));

    // When
    mapTokenService.get().then(token => {
      // Then
      expect(token.startsWith("pk.")).toBe(true);
      httpTestingController.expectNone(() => true);
      done();
    });
  });
});
