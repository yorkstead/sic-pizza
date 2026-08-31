import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SIC Pizza | Tableside POS",
    short_name: "SIC Pizza",
    description: "Collaborative tableside ordering and restaurant POS.",
    start_url: "/",
    display: "standalone",
    background_color: "#171412",
    theme_color: "#ea580c",
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
