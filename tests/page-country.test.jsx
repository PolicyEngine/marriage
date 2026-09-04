/**
 * Regression tests for country resolution on the server component.
 *
 * The host rewrite for /uk/marriage proxies to this app with ?country=uk.
 * `searchParams` is a Promise in Next 15+; reading it synchronously yields
 * undefined and pins every route to the US default.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("../app/MarriageApp", () => ({
  default: ({ initialCountry }) => null,
}));

import Page, { generateMetadata } from "../app/page.jsx";

// Next passes searchParams as a Promise.
const params = (obj) => Promise.resolve(obj);

describe("country resolution from searchParams", () => {
  it("resolves uk from a promised ?country=uk", async () => {
    const el = await Page({ searchParams: params({ country: "uk" }) });
    expect(el.props.initialCountry).toBe("uk");
  });

  it("resolves us from a promised ?country=us", async () => {
    const el = await Page({ searchParams: params({ country: "us" }) });
    expect(el.props.initialCountry).toBe("us");
  });

  it("is case-insensitive", async () => {
    const el = await Page({ searchParams: params({ country: "UK" }) });
    expect(el.props.initialCountry).toBe("uk");
  });

  it("falls back to null with no country", async () => {
    const el = await Page({ searchParams: params({}) });
    expect(el.props.initialCountry).toBeNull();
  });

  it("rejects an unknown country", async () => {
    const el = await Page({ searchParams: params({ country: "fr" }) });
    expect(el.props.initialCountry).toBeNull();
  });
});

describe("generateMetadata", () => {
  it("uses UK copy and canonical on the UK route", async () => {
    const m = await generateMetadata({ searchParams: params({ country: "uk" }) });
    expect(m.description).toMatch(/UK/);
    expect(m.description).not.toMatch(/US state/);
    expect(m.alternates.canonical).toBe("https://policyengine.org/uk/marriage");
  });

  it("keeps US copy and canonical by default", async () => {
    const m = await generateMetadata({ searchParams: params({}) });
    expect(m.description).toMatch(/US state/);
    expect(m.alternates.canonical).toBe("https://policyengine.org/us/marriage");
  });
});
