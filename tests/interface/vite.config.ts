import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
export default defineConfig({
  root: path("./"),
  envDir: path("./"),
  envPrefix: "ISOLATED_TEST_",
  plugins: [react(), tailwind()],
  resolve: {
    alias: [
      { find: "@/integrations/supabase/client", replacement: path("./supabase.mock.ts") },
      { find: "@/lib/records-admin.functions", replacement: path("./records.mock.ts") },
      { find: "@", replacement: path("../../src") },
    ],
  },
  server: { host: "127.0.0.1", port: 4175, strictPort: true, fs: { allow: [path("../../")] } },
});
