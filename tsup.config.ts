import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['index.ts'],
  outDir: 'dist',
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  minify: false,
  target: 'es2020',
  external: ['rxjs'],
  skipNodeModulesBundle: true,
  banner: {
    js: '/* Walle SDK - Video Processing Library */'
  },
  esbuildOptions(options) {
    options.supported = {
      'dynamic-import': true
    }
  }
})
