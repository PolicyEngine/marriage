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

  it("falls back to null with no country, letting the app apply its default", async () => {
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

  it("uses UK copy by default, since the UK is the default country", async () => {
    const m = await generateMetadata({ searchParams: params({}) });
    expect(m.description).toMatch(/UK/);
    expect(m.alternates.canonical).toBe("https://policyengine.org/uk/marriage");
  });

  it("still uses US copy on an explicit US route", async () => {
    const m = await generateMetadata({ searchParams: params({ country: "us" }) });
    expect(m.description).toMatch(/US state/);
    expect(m.alternates.canonical).toBe("https://policyengine.org/us/marriage");
  });
});

describe("social preview metadata", () => {
  // Next merges metadata shallowly, so a nested object returned by the page
  // replaces the layout's object of the same name. Returning openGraph without
  // images silently drops the branded share image on both routes.
  it("keeps an Open Graph image on both countries", async () => {
    for (const country of ["uk", "us"]) {
      const m = await generateMetadata({ searchParams: params({ country }) });
      expect(m.openGraph.images, country).toBeDefined();
      expect(m.openGraph.images.length, country).toBeGreaterThan(0);
      expect(m.openGraph.siteName, country).toBe("PolicyEngine");
    }
  });

  it("keeps the large Twitter card and site handle", async () => {
    const m = await generateMetadata({ searchParams: params({ country: "uk" }) });
    expect(m.twitter.card).toBe("summary_large_image");
    expect(m.twitter.site).toBe("@ThePolicyEngine");
    expect(m.twitter.images.length).toBeGreaterThan(0);
  });
});
