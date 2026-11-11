import { escapeHtml } from "./escape-html";

describe("escapeHtml", () => {
  it("should escape HTML special characters", () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')"> & more`)).toEqual(
      "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp; more"
    );
  });

  it("should leave plain text unchanged", () => {
    expect(escapeHtml("Morning Ride 42")).toEqual("Morning Ride 42");
  });

  it("should return an empty string for null or undefined", () => {
    expect(escapeHtml(null)).toEqual("");
    expect(escapeHtml(undefined)).toEqual("");
  });

  it("should stringify non-string values", () => {
    expect(escapeHtml(42)).toEqual("42");
  });
});
