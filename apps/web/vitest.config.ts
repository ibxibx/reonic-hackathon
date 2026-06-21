import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        // The Oracle suite includes CPU-bound gradient-descent model fits
        // (coefficient recovery, calibration sweeps, ablations) that can exceed
        // the 5s default when the whole suite runs concurrently. A generous
        // global timeout keeps the suite deterministic under parallel load.
        testTimeout: 120000,
        hookTimeout: 120000,
    },
})