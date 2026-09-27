import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://exploreshoiningcities.com",
  output: "static",
  trailingSlash: "never",
  build: {
    format: "directory"
  }
});
