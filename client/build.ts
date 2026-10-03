// Production build: bundles index.html (with Tailwind) into dist/.
import { rm } from "node:fs/promises";
import tailwind from "bun-plugin-tailwind";

await rm("./dist", { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: ["./index.html"],
  outdir: "./dist",
  publicPath: "/",
  minify: true,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  plugins: [tailwind],
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
console.log(`Built ${result.outputs.length} files into dist/`);
