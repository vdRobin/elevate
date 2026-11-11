import { DesktopElevateErrorHandler } from "./desktop-elevate-error-handler";
import { environment } from "../../environments/environment";

describe("DesktopElevateErrorHandler", () => {
  const initialProduction = environment.production;
  const initialSentryDsn = environment.sentryDsn;

  afterEach(() => {
    environment.production = initialProduction;
    environment.sentryDsn = initialSentryDsn;
  });

  it("should not report crashes from a production build without a Sentry DSN (fork default)", () => {
    environment.production = true;
    environment.sentryDsn = null;
    expect(DesktopElevateErrorHandler.isCrashReportingEnabled()).toBe(false);
  });

  it("should not report crashes from a development build", () => {
    environment.production = false;
    environment.sentryDsn = "https://key@example.org/1";
    expect(DesktopElevateErrorHandler.isCrashReportingEnabled()).toBe(false);
  });

  it("should report crashes only from a production build with a Sentry DSN", () => {
    environment.production = true;
    environment.sentryDsn = "https://key@example.org/1";
    expect(DesktopElevateErrorHandler.isCrashReportingEnabled()).toBe(true);
  });
});
