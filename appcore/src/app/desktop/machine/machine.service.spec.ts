import { fakeAsync, flush, TestBed } from "@angular/core/testing";
import { HttpClientTestingModule, HttpTestingController } from "@angular/common/http/testing";
import { CoreModule } from "../../core/core.module";
import { SharedModule } from "../../shared/shared.module";
import { TargetModule } from "../../shared/modules/target/desktop-target.module";
import { IPC_TUNNEL_SERVICE } from "../ipc/ipc-tunnel-service.token";
import { IpcRendererTunnelServiceMock } from "../ipc/ipc-renderer-tunnel-service.mock";
import { DataStore } from "../../shared/data-store/data-store";
import { TestingDataStore } from "../../shared/data-store/testing-datastore.service";
import { MachineService } from "./machine.service";
import { environment } from "../../../environments/environment";

describe("MachineService", () => {
  let machineService: MachineService;
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

    machineService = TestBed.inject(MachineService);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    environment.backendBaseUrl = initialBackendBaseUrl;
    httpTestingController.verify();
  });

  describe("with no backend configured (fork default)", () => {
    beforeEach(() => {
      environment.backendBaseUrl = null;
    });

    it("should report the backend as disabled", () => {
      expect(MachineService.isBackendEnabled()).toBe(false);
    });

    it("should not collect nor send anything on check-in", fakeAsync(() => {
      // Given
      const runtimeInfoSpy = spyOn(machineService.runtimeInfoService, "get").and.callThrough();

      // When
      machineService.checkIn();
      flush();

      // Then
      expect(runtimeInfoSpy).not.toHaveBeenCalled();
      httpTestingController.expectNone(() => true);
    }));

    it("should fail authentication without sending a request", fakeAsync(() => {
      // Given
      const credentialsSpy = spyOn(machineService.runtimeInfoService, "getMachineCredentials").and.callThrough();
      let failed = false;

      // When
      machineService.auth().subscribe({ error: () => (failed = true) });
      flush();

      // Then
      expect(failed).toBe(true);
      expect(credentialsSpy).not.toHaveBeenCalled();
      httpTestingController.expectNone(() => true);
    }));
  });

  describe("with a backend configured", () => {
    it("should report the backend as enabled", () => {
      environment.backendBaseUrl = "http://localhost:8081";
      expect(MachineService.isBackendEnabled()).toBe(true);
    });
  });
});
