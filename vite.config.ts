import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  build: {
    lib: {
      entry: 'index.ts',
      name: 'Walle',
      formats: ['es', 'cjs'],
      fileName: format => (format === 'es' ? 'index.mjs' : 'index.js')
    },
    sourcemap: true,
    rollupOptions: {
      external: ['rxjs']
    },
    target: 'es2020'
  },
  plugins: [
    dts({
      entryRoot: '.',
      include: ['index.ts', 'src'],
      exclude: ['node_modules'],
      rollupTypes: true,
      copyDtsFiles: true,
      tsconfigPath: './tsconfig.json'
    })
  ]
})
