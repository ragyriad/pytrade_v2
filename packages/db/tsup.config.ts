import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: {
    compilerOptions: {
      moduleResolution: "nodenext",
      module: "nodenext",
    },
  },
  tsconfig: "./tsconfig.db.json",
});