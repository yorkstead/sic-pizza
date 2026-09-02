import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SIC Pizza | Tableside POS",
    short_name: "SIC Pizza",
    description: "Collaborative tableside ordering and restaurant POS.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f5dc",
    theme_color: "#5c4033",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
