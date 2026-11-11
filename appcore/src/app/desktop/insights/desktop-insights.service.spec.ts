import { fakeAsync, flush, TestBed } from "@angular/core/testing";
import { HttpClientTestingModule, HttpTestingController } from "@angular/common/http/testing";
import { CoreModule } from "../../core/core.module";
import { SharedModule } from "../../shared/shared.module";
import { TargetModule } from "../../shared/modules/target/desktop-target.module";
import { IPC_TUNNEL_SERVICE } from "../ipc/ipc-tunnel-service.token";
import { IpcRendererTunnelServiceMock } from "../ipc/ipc-renderer-tunnel-service.mock";
import { DataStore } from "../../shared/data-store/data-store";
import { TestingDataStore } from "../../shared/data-store/testing-datastore.service";
import { DesktopInsightsService } from "./desktop-insights.service";
import { environment } from "../../../environments/environment";
import { Activity } from "@elevate/shared/models/sync/activity.model";

describe("DesktopInsightsService", () => {
  let insightsService: DesktopInsightsService;
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

    insightsService = TestBed.inject(DesktopInsightsService);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    environment.backendBaseUrl = initialBackendBaseUrl;
    httpTestingController.verify();
  });

  it("should not upload activities when no backend is configured", fakeAsync(() => {
    // Given
    environment.backendBaseUrl = null;
    const activity = new Activity();
    activity.manual = false;
    const credentialsSpy = spyOn(insightsService.runtimeInfoService, "getMachineCredentials").and.callThrough();

    // When
    insightsService.registerActivities([activity], true);
    insightsService.registerActivities([activity], false);
    flush();

    // Then
    expect(credentialsSpy).not.toHaveBeenCalled();
    httpTestingController.expectNone(() => true);
  }));
});
