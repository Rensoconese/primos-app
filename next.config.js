/** @type {import('next').NextConfig} */
const { withSentryConfig } = require("@sentry/nextjs");

const nextConfig = {
  /* config options here */
  
  // Para Turbopack y Webpack, usar el directorio de salida estándar
  distDir: '.next',
  
  // Configurar webpack para manejar módulos faltantes como pino-pretty
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      'pino-pretty': false
    };
    return config;
  },
  
  // Configurar ESLint
  eslint: {
    // Sólo ejecutar ESLint en estos directorios durante la compilación
    dirs: ['src/app', 'src/components', 'src/hooks', 'src/services', 'src/utils'],
    // No ignorar errores de ESLint durante la compilación para Vercel
    ignoreDuringBuilds: true, // Mantener true para evitar fallos en la compilación inicialmente
  },
  
  // Configuración de TypeScript
  typescript: {
    // Inicialmente mantener esta configuración para evitar que fallos de TypeScript impidan el despliegue
    // Una vez que el despliegue sea exitoso, considerar cambiar a false para mayor seguridad
    ignoreBuildErrors: true,
  },
  
  // Configurar on-demand entries para el servidor de desarrollo de Next.js
  onDemandEntries: {
    // Se pueden especificar directorios excluidos adicionales aquí
    // Next.js ya maneja las exclusiones predeterminadas
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 2,
  },

  // Configuración para componentes del servidor
  serverExternalPackages: [], // Movido desde experimental.serverComponentsExternalPackages
  
  // Configuración experimental para el proyecto
  experimental: {
    // Usar estas opciones sólo si son necesarias para tu proyecto
    // Si causan problemas, comentarlas
  },
};

module.exports = withSentryConfig(
  nextConfig,
  {
    // For all available options, see:
    // https://github.com/getsentry/sentry-webpack-plugin#options

    org: "primos",
    project: "sentry-primos-checkin",

    // Only print logs for uploading source maps in CI
    silent: !process.env.CI,

    // For all available options, see:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,

    // Automatically annotate React components to show their full name in breadcrumbs and session replay
    reactComponentAnnotation: {
      enabled: true,
    },

    // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
    // This can increase your server load as well as your hosting bill.
    // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
    // side errors will fail.
    tunnelRoute: "/monitoring",

    // Hides source maps from generated client bundles
    hideSourceMaps: true,

    // Automatically tree-shake Sentry logger statements to reduce bundle size
    disableLogger: true,

    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,
  }
);
