import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'es2020',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: true,  // Generate .d.ts files
  shims: true,  // Shims for __dirname, __filename if needed
})
