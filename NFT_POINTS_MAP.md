# Mapa de Puntos de NFTs

## Descripción

Este sistema implementa un mapa precalculado de puntos para los NFTs de Primos, lo que mejora significativamente el rendimiento y la consistencia del cálculo de puntos en la aplicación.

## Beneficios

- **Rendimiento mejorado**: Elimina la necesidad de calcular los puntos en tiempo real, reduciendo significativamente el tiempo de procesamiento.
- **Reducción de consultas a la blockchain**: Ya no es necesario consultar los metadatos de los NFTs en la blockchain cada vez.
- **Simplificación del código**: El cálculo de puntos se simplifica a una simple búsqueda en un mapa.
- **Consistencia**: Todos los cálculos de puntos son consistentes, ya que se basan en un único archivo de referencia.
- **Mantenibilidad**: Si cambian las reglas de cálculo de puntos, solo hay que regenerar el archivo JSON.

## Estructura

El sistema consta de los siguientes componentes:

1. **`script-generate-nft-points-map.ts`**: Script TypeScript que genera el mapa de puntos a partir de los metadatos de los NFTs.
2. **`generate-nft-points.js`**: Script ejecutable que facilita la ejecución del generador.
3. **`src/data/nftPoints.ts`**: Archivo generado que contiene el mapa de puntos y funciones de utilidad.

## Uso

### Generación del Mapa de Puntos

Para generar o actualizar el mapa de puntos, ejecute:

```bash
./generate-nft-points.js
```

Este comando:
1. Consulta la base de datos para obtener los metadatos de todos los NFTs.
2. Calcula los puntos según las reglas establecidas (rareza y atributos).
3. Genera el archivo `src/data/nftPoints.ts` con el mapa de puntos y funciones de utilidad.

### Uso en el Código

El archivo generado proporciona las siguientes funciones:

```typescript
// Obtiene los puntos de un NFT por su ID
// Lanza un error si el NFT no existe en el mapa
function getNFTPoints(tokenId: string): number;

// Verifica si un NFT existe en el mapa de puntos
function hasNFTPoints(tokenId: string): boolean;

// Obtiene los puntos de un NFT de forma segura
// Devuelve un valor por defecto si el NFT no existe en el mapa
function getNFTPointsSafe(tokenId: string, defaultValue: number = 0): number;
```

Ejemplo de uso:

```typescript
import { getNFTPointsSafe } from '@/data/nftPoints';

// Obtener los puntos de un NFT
const points = getNFTPointsSafe(tokenId, 0);
console.log(`El NFT #${tokenId} tiene ${points} puntos`);
```

## Mantenimiento

El mapa de puntos debe regenerarse en los siguientes casos:

1. Cuando se añaden nuevos NFTs a la colección.
2. Cuando cambian los atributos de los NFTs existentes.
3. Cuando cambian las reglas de cálculo de puntos.

## Reglas de Cálculo de Puntos

Los puntos se calculan según la rareza y atributos de los NFTs:

- **Original**: +1 punto
- **Original Z**: +4 puntos
- **Shiny**: +7 puntos
- **Shiny Z**: +13 puntos
- **Unique**: +30 puntos
- **Full Set** (adicional): +2 puntos

## Integración con el Sistema Existente

El sistema de mapa de puntos se integra con el sistema existente de la siguiente manera:

1. El servicio `nftService.ts` utiliza el mapa de puntos para obtener los puntos de los NFTs.
2. El sistema de bloqueo de NFTs en Redis sigue funcionando de la misma manera.
3. Los endpoints de API utilizan el servicio actualizado para calcular los puntos.
