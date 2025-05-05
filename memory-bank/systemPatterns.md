# System Patterns: Primos CheckIn

## Arquitectura del Sistema

### Arquitectura General
Primos CheckIn sigue una arquitectura de aplicación web moderna basada en Next.js con integración blockchain. El sistema se divide en las siguientes capas:

1. **Capa de Presentación**: Componentes React que conforman la interfaz de usuario
2. **Capa de Lógica de Negocio**: Servicios y hooks que implementan la lógica principal
3. **Capa de API**: Endpoints serverless para operaciones del lado del servidor
4. **Capa de Datos**: Interacción con Supabase y contratos blockchain
5. **Capa de Infraestructura**: Configuración de despliegue en Vercel

### Diagrama de Arquitectura
```
┌─────────────────────────────────────────────────────────────┐
│                     Cliente (Navegador)                     │
└───────────────────────────────┬─────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────┐
│                        Next.js Frontend                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │ Componentes │  │    Hooks     │  │      Servicios     │  │
│  └─────────────┘  └──────────────┘  └────────────────────┘  │
└───────────────────────────────┬─────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────┐
│                      Next.js API Routes                      │
└─────────────┬─────────────────────────────────┬─────────────┘
              │                                 │
┌─────────────▼─────────────┐     ┌─────────────▼─────────────┐
│        Supabase DB        │     │     Blockchain (Ronin)     │
└───────────────────────────┘     └───────────────────────────┘
```

## Decisiones Técnicas Clave

### 1. Next.js App Router
Se utiliza el App Router de Next.js para aprovechar las ventajas de React Server Components y mejorar el rendimiento de la aplicación. Esto permite una carga más rápida y una mejor experiencia de usuario.

### 2. Patrón de API Routes
Las operaciones que requieren acceso a claves privadas o interacción directa con la base de datos se implementan como API Routes serverless, manteniendo la seguridad y separando claramente las responsabilidades.

### 3. Estrategia de Conexión RPC
Se implementa un sistema de fallback para conexiones RPC con múltiples endpoints y mecanismos de reintento, garantizando la disponibilidad y robustez de las interacciones con la blockchain.

### 4. Manejo de Estado con Zustand
Se utiliza Zustand para la gestión del estado global, proporcionando una solución ligera y eficiente que evita los problemas de rendimiento asociados con soluciones más pesadas.

### 5. Patrón de Servicios
La lógica de negocio compleja se encapsula en servicios (como nftService), facilitando la reutilización y el mantenimiento del código.

## Patrones de Diseño Utilizados

### 1. Patrón Repositorio
Implementado en las interacciones con Supabase, abstrayendo la lógica de acceso a datos y proporcionando una interfaz consistente para operaciones CRUD.

### 2. Patrón Factory
Utilizado en la creación de instancias de contratos (CheckIn__factory), simplificando la inicialización y configuración de objetos complejos.

### 3. Patrón Estrategia
Aplicado en el sistema de conexión RPC, permitiendo intercambiar diferentes estrategias de conexión según las condiciones (primaria, secundaria, pública).

### 4. Patrón Observer
Implementado en la integración con wallet Ronin, donde los componentes se suscriben a eventos de la wallet (conexión, cambio de cuenta, etc.).

### 5. Patrón Retry
Utilizado en las interacciones con la blockchain, implementando reintentos con backoff exponencial para operaciones que pueden fallar temporalmente.

### 6. Patrón Time-To-Live (TTL)
Aplicado en el sistema de bloqueo de NFTs con Redis, donde los NFTs bloqueados tienen un tiempo de vida hasta la medianoche UTC, después del cual se desbloquean automáticamente.

## Relaciones entre Componentes

### Componentes de UI
- **ContractInteraction**: Interactúa con el contrato de check-in y muestra información de streak
- **NFTDisplay**: Muestra los NFTs del usuario y calcula bonificaciones
- **RewardsPanel**: Gestiona la reclamación de tokens y muestra puntos acumulados
- **LeaderboardDisplay**: Muestra la tabla de clasificación
- **RoninWallet**: Maneja la conexión con la wallet

### Servicios
- **nftService**: Centraliza la lógica relacionada con NFTs
- **contract.ts**: Proporciona funciones para interactuar con contratos
- **direct-rpc.ts**: Maneja llamadas RPC directas
- **retry-utils.ts**: Implementa mecanismos de reintento

### API Routes
- **/api/check-in**: Registra check-ins y actualiza streaks
- **/api/claim-tokens**: Procesa reclamaciones de tokens
- **/api/user-data**: Proporciona datos del usuario
- **/api/nft-check**: Verifica NFTs y calcula bonificaciones
- **/api/redis-stats**: Proporciona estadísticas sobre NFTs bloqueados en Redis
- **/api/redis-clear**: Limpia todos los NFTs bloqueados en Redis
- **/api/test-redis**: Verifica la conexión con Redis y calcula tiempo hasta reset

## Flujo de Datos

### Check-in Diario
1. Usuario hace clic en "Check In"
2. ContractInteraction llama al contrato en la blockchain
3. La transacción se confirma en la blockchain
4. API route /api/check-in registra el check-in en Supabase
5. Se calculan los puntos de NFTs y se bloquean los NFTs utilizados en Redis
6. Se actualizan streak, puntos y leaderboard

### Reclamación de Tokens
1. Usuario hace clic en "Claim"
2. RewardsPanel llama a /api/claim-tokens
3. API verifica puntos disponibles
4. Se transfieren tokens Fire Dust desde la wallet distribuidora
5. Se actualizan registros en Supabase
6. Se actualiza el leaderboard

### Bloqueo de NFTs
1. Usuario hace check-in con NFTs disponibles
2. La función `calculateNFTPoints` verifica si cada NFT está bloqueado en Redis
3. Los NFTs no bloqueados se añaden a la lista de elegibles y se bloquean en Redis
4. El bloqueo se realiza con un TTL hasta la medianoche UTC
5. Los NFTs bloqueados no pueden ser utilizados por ninguna wallet hasta que expire el TTL
6. A medianoche UTC, Redis elimina automáticamente las claves expiradas, desbloqueando los NFTs

## Consideraciones de Escalabilidad y Mantenimiento

### Escalabilidad
- Uso de Vercel para escalado automático de API routes
- Implementación de caching para reducir llamadas a la blockchain
- Lazy loading para optimizar la carga de NFTs

### Mantenimiento
- Estructura modular que facilita cambios y actualizaciones
- Logging detallado para diagnóstico de problemas
- Mecanismos de fallback para componentes críticos
- Configuración centralizada para facilitar cambios
