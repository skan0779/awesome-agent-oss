import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "awesome-agent-oss",
    short_name: "Agent OSS Radar",
    description: "A curated open-source radar for AI agent stacks.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f5f2",
    theme_color: "#17201c",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
