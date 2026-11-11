import { HttpClient } from "./http.client";
import { Logger } from "../logger";

describe("HttpClient", () => {
  const logger = { debug: () => null, info: () => null, error: () => null } as unknown as Logger;

  const browserWindowResolvingProxy = (proxy: string): Electron.BrowserWindow =>
    ({
      webContents: { session: { resolveProxy: () => Promise.resolve(proxy) } }
    } as unknown as Electron.BrowserWindow);

  const httpsAgentOf = (httpClient: HttpClient): any => (httpClient as any).axios.defaults.httpsAgent;

  it("should keep TLS certificate verification when no proxy is used", async () => {
    // Given
    const httpClient = new HttpClient(logger);

    // When
    await httpClient.configure(browserWindowResolvingProxy("DIRECT"));

    // Then: no custom agent, so Node's default agent (which verifies certificates) is used
    expect(httpClient.isConfigured).toBe(true);
    const httpsAgent = httpsAgentOf(httpClient);
    expect(httpsAgent?.options?.rejectUnauthorized).not.toBe(false);
    expect(httpsAgent).toBeUndefined();
  });

  it("should keep TLS certificate verification through a proxy", async () => {
    // Given
    const httpClient = new HttpClient(logger);

    // When
    await httpClient.configure(browserWindowResolvingProxy("PROXY 10.0.0.1:3128"));

    // Then
    const httpsAgent = httpsAgentOf(httpClient);
    expect(httpsAgent).toBeDefined();
    expect(httpsAgent.options?.rejectUnauthorized).not.toBe(false);
    expect(httpsAgent.proxy?.host ?? httpsAgent.proxy?.hostname).toEqual("10.0.0.1");
  });
});
