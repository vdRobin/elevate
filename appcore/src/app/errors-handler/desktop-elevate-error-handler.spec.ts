import { DesktopElevateErrorHandler } from "./desktop-elevate-error-handler";
import { environment } from "../../environments/environment";
import { of } from "rxjs";

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
  it("should escape the error message and stack shown in the error dialog", async () => {
    // Given: a handler with only the snackbar and dialog it needs
    const handler = Object.create(DesktopElevateErrorHandler.prototype) as DesktopElevateErrorHandler;
    const dialogOpenSpy = jasmine.createSpy("open").and.returnValue({ afterClosed: () => of(false) });
    (handler as any).snackBar = { open: () => ({ onAction: () => of(undefined) }) };
    (handler as any).dialog = { open: dialogOpenSpy };
    const error = new Error('<img src=x onerror="alert(1)">');

    // When
    handler.displayViewErrorAction(error.message, error);
    await new Promise(resolve => setTimeout(resolve));

    // Then
    const data = dialogOpenSpy.calls.mostRecent().args[1].data;
    expect(data.title).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(data.title).not.toContain("<img");
    expect(data.content).not.toContain("<img");
  });
});
