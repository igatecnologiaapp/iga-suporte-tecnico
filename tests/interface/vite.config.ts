import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
export default defineConfig({
  root: path("./"),
  envDir: path("./"),
  envPrefix: "ISOLATED_TEST_",
  plugins: [
    react(),
    tailwind(),
    {
      name: "isolated-auth-security-fixture",
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          if (request.url?.split("?")[0] !== "/auth-security") return next();
          if (request.method !== "GET") {
            response.statusCode = 405;
            response.end("Native submission is not an authentication endpoint.");
            return;
          }
          try {
            const fixture = await server.ssrLoadModule(path("./auth-security.render.tsx"));
            response.setHeader("Content-Type", "text/html; charset=utf-8");
            response.end(await server.transformIndexHtml("/auth-security", fixture.render()));
          } catch (error) {
            next(error);
          }
        });
      },
    },
  ],
  resolve: {
    alias: [
      { find: "@/integrations/supabase/client", replacement: path("./supabase.mock.ts") },
      { find: "@/lib/records-admin.functions", replacement: path("./records.mock.ts") },
      { find: "@", replacement: path("../../src") },
    ],
  },
  server: { host: "127.0.0.1", port: 4175, strictPort: true, fs: { allow: [path("../../")] } },
});
