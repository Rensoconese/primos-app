// import * as Sentry from '@sentry/nextjs'; // Temporalmente deshabilitado
import type { Instrumentation } from 'next';

export async function register() {
  // Temporalmente deshabilitado Sentry por conflictos con Rollup en producción
  // if (process.env.NEXT_RUNTIME === 'nodejs') {
  //   await import('../sentry.server.config')
  // }

  // if (process.env.NEXT_RUNTIME === 'edge') {
  //   await import('../sentry.edge.config')
  // }
}

export const onRequestError: Instrumentation.onRequestError = (...args) => {
  // Sentry.captureRequestError(...args); // Temporalmente deshabilitado
};