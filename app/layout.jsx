import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const SITE_URL = "https://policyengine.org/us/marriage";
const OG_IMAGE = "https://policyengine.org/us/marriage/og-image.png";

// Matches the GA4 property used by policyengine-app-v2/website so
// page_view and tool_engaged events from this calculator land in the
// same account as the rest of policyengine.org traffic.
const GA_MEASUREMENT_ID = "G-2YHG89FY0N";

// Paths referenced in <head> must be explicitly prefixed — Next does not apply
// basePath to metadata.icons values the way it does for <Image> or <Link>.
const BASE_PATH =
  process.env.NEXT_PUBLIC_BASE_PATH === ""
    ? ""
    : process.env.NEXT_PUBLIC_BASE_PATH || "/us/marriage";

export const metadata = {
  title: "Marriage Tax Calculator — Marriage Penalty & Bonus | PolicyEngine",
  description:
    "Calculate how marriage affects your taxes and government benefits. See your marriage penalty or bonus across income levels for any US state.",
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: SITE_URL },
  openGraph: {
    type: "website",
    title: "Marriage Tax Calculator — Marriage Penalty & Bonus",
    description:
      "Calculate how marriage affects your taxes and government benefits. See your marriage penalty or bonus across income levels for any US state.",
    url: SITE_URL,
    siteName: "PolicyEngine",
    images: [{ url: OG_IMAGE }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Marriage Tax Calculator — Marriage Penalty & Bonus",
    description:
      "Calculate how marriage affects your taxes and government benefits. See your marriage penalty or bonus across income levels for any US state.",
    images: [OG_IMAGE],
    site: "@ThePolicyEngine",
  },
  icons: { icon: `${BASE_PATH}/favicon.svg` },
  other: {
    "theme-color": "#319795",
    "google-site-verification": "e0FQ3UjJN2lisTAFsgKrfoIO9BbU6nTO2sROpKntyAo",
  },
  robots: { index: true, follow: true },
};

const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Marriage Tax Calculator",
  description:
    "Calculate how marriage affects your taxes and government benefits. See your marriage penalty or bonus across income levels for any US state.",
  url: SITE_URL,
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  author: {
    "@type": "Organization",
    name: "PolicyEngine",
    url: "https://policyengine.org",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.className}>
      <head>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            window.gtag = gtag;
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}');
          `}
        </Script>
      </head>
      <body>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
        />
      </body>
    </html>
  );
}
