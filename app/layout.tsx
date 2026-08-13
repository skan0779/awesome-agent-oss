import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const siteUrl = new URL("https://awesomeagent.vercel.app");
const title = "awesome-agent-oss | Open-source AI agent stack radar";
const description =
  "Discover curated open-source tools for building AI agents and track repository growth across frameworks, RAG, memory, MCP, evaluation, observability, and more.";

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: title,
    template: "%s | awesome-agent-oss",
  },
  description,
  applicationName: "awesome-agent-oss",
  keywords: [
    "AI agents",
    "agentic AI",
    "open source AI",
    "AI agent frameworks",
    "RAG",
    "MCP",
    "LLM observability",
    "AI agent tools",
  ],
  authors: [{ name: "skan0779", url: "https://github.com/skan0779" }],
  creator: "skan0779",
  publisher: "awesome-agent-oss",
  category: "technology",
  verification: {
    google: "3QUgF3BFl2CHGmoz1vIWkfsKvfaNhm8C8HuZ6IL6W8g",
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "awesome-agent-oss",
    title,
    description,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "awesome-agent-oss - Open-source AI agent stack radar",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
