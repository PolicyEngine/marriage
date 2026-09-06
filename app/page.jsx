import MarriageApp from "./MarriageApp";
import { DEFAULT_COUNTRY } from "@/lib/countries";

// Next merges metadata shallowly: a nested object returned here REPLACES the
// layout's object of the same name rather than merging into it. So openGraph
// and twitter must repeat the image and card fields, or the country routes
// lose the branded social preview the layout supplies.
const OG_IMAGE = "https://policyengine.org/us/marriage/og-image.png";

const COPY = {
  us: {
    title: "Marriage Tax Calculator — Marriage Penalty & Bonus | PolicyEngine",
    description:
      "Calculate how marriage affects your taxes and government benefits. See your marriage penalty or bonus across income levels for any US state.",
    url: "https://policyengine.org/us/marriage",
  },
  uk: {
    title: "Couple Penalty Calculator — Marriage Penalty & Bonus | PolicyEngine",
    description:
      "Calculate how living as a couple affects your taxes and benefits in the UK. See your couple penalty or bonus across income levels for England, Scotland, Wales and Northern Ireland.",
    url: "https://policyengine.org/uk/marriage",
  },
};

// The host rewrite for /uk/marriage points at this app with ?country=uk.
// Next rewrites are reverse proxies, so that query only ever exists
// server-side — the browser URL stays on the policyengine.org path.
function resolveCountry(searchParams) {
  const raw = searchParams?.country;
  const country = typeof raw === "string" ? raw.toLowerCase() : null;
  return country === "us" || country === "uk" ? country : null;
}

export async function generateMetadata({ searchParams }) {
  const copy = COPY[resolveCountry(await searchParams) || DEFAULT_COUNTRY];
  return {
    title: copy.title,
    description: copy.description,
    alternates: { canonical: copy.url },
    openGraph: {
      type: "website",
      title: copy.title,
      description: copy.description,
      url: copy.url,
      siteName: "PolicyEngine",
      images: [{ url: OG_IMAGE }],
    },
    twitter: {
      card: "summary_large_image",
      title: copy.title,
      description: copy.description,
      images: [OG_IMAGE],
      site: "@ThePolicyEngine",
    },
  };
}

// `searchParams` is a Promise in Next 15+, so it must be awaited. Reading it
// synchronously silently yielded `undefined` and pinned every route to the US
// default, which is what broke /uk/marriage.
export default async function Page({ searchParams }) {
  const initialCountry = resolveCountry(await searchParams);
  return <MarriageApp initialCountry={initialCountry} />;
}
