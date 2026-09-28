import next from "eslint-config-next/core-web-vitals";
import root from "../../eslint.config.mjs";

// ESLint 10 resolves config from each file's directory, so this file owns
// apps/web; the Next plugins stay out of apps/api and packages.
export default [
  ...root,
  ...next,
  {
    // eslint-plugin-react 7.37's version "detect" calls context.getFilename,
    // which ESLint 10 removed. Pinning the version skips detection.
    settings: { react: { version: "19.3" } },
    rules: {
      // Every hit is a fetch-on-mount or a mounted/hydration flag, both deliberate.
      "react-hooks/set-state-in-effect": "off",
      // Every <img> is a user upload on the Supabase Storage origin; next/image
      // would need remotePatterns and the optimizer for no gain on these sizes.
      "@next/next/no-img-element": "off"
    }
  },
  {
    // Async server components run once per request; Date.now() there is the
    // server clock handed down on purpose, not an impure render.
    files: ["src/app/**/page.tsx"],
    rules: { "react-hooks/purity": "off" }
  }
];
