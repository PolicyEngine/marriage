import MarriageApp from "./MarriageApp";

// Server component — reads ?country= from the host rewrite destination
// (Next rewrites are reverse proxies, so this query only lives server-side).
// Passing it as a prop lets /uk/marriage render the UK variant on SSR without
// a flash of the US default before the client mounts.
export default function Page({ searchParams }) {
  const raw = searchParams?.country;
  const country = typeof raw === "string" ? raw.toLowerCase() : null;
  const initialCountry = country === "us" || country === "uk" ? country : null;
  return <MarriageApp initialCountry={initialCountry} />;
}
