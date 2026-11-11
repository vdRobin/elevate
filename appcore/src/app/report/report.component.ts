import { Component, Inject, OnInit } from "@angular/core";
import { Observable } from "rxjs";
import { OPEN_RESOURCE_RESOLVER, OpenResourceResolver } from "../shared/services/links-opener/open-resource-resolver";
import { AppPackage } from "@elevate/shared/tools/app-package";
import { countdown } from "@elevate/shared/tools/countdown";

@Component({
  selector: "app-report",
  templateUrl: "./report.component.html",
  styleUrls: ["./report.component.scss"]
})
export class ReportComponent implements OnInit {
  constructor(@Inject(OPEN_RESOURCE_RESOLVER) protected readonly openResourceResolver: OpenResourceResolver) {}

  private static readonly REPORT_COUNTDOWN_SECONDS: number = 20;

  public allowReportCountdown$: Observable<number>;

  public ngOnInit(): void {
    this.allowReportCountdown$ = countdown(ReportComponent.REPORT_COUNTDOWN_SECONDS);
  }

  public onOpenOnlineDoc(): void {
    this.openResourceResolver.openLink(AppPackage.getElevateDoc());
  }

  public onReport(): void {
    this.onGoToGithubIssues();
  }

  public getIssuesUrl(): string {
    return `${AppPackage.getRepositoryUrl()}/issues`;
  }

  public onGoToGithubIssues(): void {
    this.openResourceResolver.openLink(this.getIssuesUrl());
  }
}
