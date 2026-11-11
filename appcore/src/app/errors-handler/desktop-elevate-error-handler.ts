import { ElevateErrorHandler } from "./elevate-error-handler";
import { Inject, Injectable } from "@angular/core";
import { VersionsProvider } from "../shared/services/versions/versions-provider";
import { MatDialog } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { LoggerService } from "../shared/services/logging/logger.service";
import { AthleteService } from "../shared/services/athlete/athlete.service";
import * as Sentry from "@sentry/browser";
import { environment } from "../../environments/environment";
import { ConfirmDialogComponent } from "../shared/dialogs/confirm-dialog/confirm-dialog.component";
import { ConfirmDialogDataModel } from "../shared/dialogs/confirm-dialog/confirm-dialog-data.model";
import { ElectronService } from "../desktop/electron/electron.service";
import { RuntimeInfoService } from "../desktop/machine/runtime-info.service";
import { RuntimeInfo } from "@elevate/shared/electron/runtime-info";
import { AthleteModel } from "@elevate/shared/models/athlete/athlete.model";
import { escapeHtml } from "@elevate/shared/tools/escape-html";

@Injectable({
  providedIn: "root"
})
export class DesktopElevateErrorHandler extends ElevateErrorHandler {
  /**
   * Crash reporting runs only in production builds that configure a Sentry DSN. The fork sets none.
   */
  public static isCrashReportingEnabled(): boolean {
    return environment.production && !!environment.sentryDsn;
  }

  constructor(
    @Inject(VersionsProvider) protected readonly versionsProvider: VersionsProvider,
    @Inject(MatDialog) protected readonly dialog: MatDialog,
    @Inject(MatSnackBar) protected readonly snackBar: MatSnackBar,
    @Inject(LoggerService) protected readonly loggerService: LoggerService,
    @Inject(AthleteService) protected readonly athleteService: AthleteService,
    @Inject(RuntimeInfoService) protected readonly runtimeInfoService: RuntimeInfoService,
    @Inject(ElectronService) protected readonly electronService: ElectronService
  ) {
    super(versionsProvider, dialog, snackBar, loggerService);

    if (DesktopElevateErrorHandler.isCrashReportingEnabled()) {
      Sentry.init({
        dsn: environment.sentryDsn,
        release: this.versionsProvider.getPackageVersion(),
        environment: "production",
        autoSessionTracking: false
      });

      // Context carries no names, machine id, OS username or hostname.
      Promise.all([this.runtimeInfoService.get(), this.athleteService.fetch()]).then(results => {
        const [runtimeInfo, athlete] = results as [RuntimeInfo, AthleteModel];

        Sentry.setContext("athlete", {
          gender: athlete.gender,
          practiceLevel: athlete.practiceLevel,
          cpu: runtimeInfo.cpu.name,
          memory: runtimeInfo.memorySizeGb
        });
      });
    }
  }

  public onErrorHandled(error: Error): void {
    if (DesktopElevateErrorHandler.isCrashReportingEnabled()) {
      Sentry.captureException((error as any).originalError || error);
    }
  }

  public displayViewErrorAction(errorMessage: string, error: Error): void {
    this.snackBar
      .open("An unhandled error occurred", "Help")
      .onAction()
      .toPromise()
      .then(() => {
        const dialogRef = this.dialog.open(ConfirmDialogComponent, {
          data: {
            title: `Unhandled issue occurred: ${escapeHtml(errorMessage)}.`,
            content: `
                <div>
                  <strong>Unfortunatly Elevate experienced the below unhandled issue. <span class="warn-color">If error still blocks the application, you might reset the app using below "Reset app" button (your data will be wiped).</span></strong></br>
                </div>
                <div>
                  <pre class="mat-caption">${escapeHtml(error.stack)}</pre>
                </div>
            `,
            cancelText: "Forget",
            confirmText: "Reset app",
            confirmColor: "warn"
          } as ConfirmDialogDataModel
        });

        dialogRef
          .afterClosed()
          .toPromise()
          .then((confirm: boolean) => {
            if (confirm) {
              this.onFullAppReset();
            }
          });
      });
  }

  public onFullAppReset(): void {
    const data: ConfirmDialogDataModel = {
      title: "Full application reset",
      content: `This will erase everything to reach a "fresh install" state. Are you sure to perform this action?`,
      confirmColor: "warn"
    };

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      minWidth: ConfirmDialogComponent.MIN_WIDTH,
      maxWidth: ConfirmDialogComponent.MAX_WIDTH,
      data: data
    });

    dialogRef.afterClosed().subscribe((confirm: boolean) => {
      if (confirm) {
        this.electronService.resetApp();
      }
    });
  }
}
