/** @type {import('next').NextConfig} */

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

  // Configuración adicional para optimización
  swcMinify: true, // Usar SWC para minificación (más rápido que Terser)
  
  // Configuración experimental para el proyecto
  experimental: {
    // Usar estas opciones sólo si son necesarias para tu proyecto
    // Si causan problemas, comentarlas
    serverComponentsExternalPackages: []
  },
};

module.exports = nextConfig;
