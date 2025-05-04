/**
 * Utilities para reintento de operaciones con backoff exponencial y logs detallados.
 */

/**
 * Función genérica para reintentar operaciones con backoff exponencial
 * @param operation Función que realiza la operación que puede fallar
 * @param maxAttempts Número máximo de intentos
 * @param initialDelay Tiempo de espera inicial en ms
 * @param backoffFactor Factor de incremento para backoff exponencial
 * @param operationName Nombre descriptivo de la operación para logs
 * @returns Resultado de la operación si éxito
 * @throws El último error encontrado si todos los intentos fallan
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 5,
  initialDelay: number = 1000,
  backoffFactor: number = 2,
  operationName: string = "Operation"
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[${operationName}] Attempt ${attempt}/${maxAttempts}`);
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      // Log detallado del error
      console.error(`[${operationName}] Attempt ${attempt} failed:`, error.message);
      logDetailedError(error, operationName);
      
      // Si es el último intento, no esperar
      if (attempt === maxAttempts) {
        console.error(`[${operationName}] All ${maxAttempts} attempts failed`);
        break;
      }
      
      // Calcular delay con backoff exponencial y jitter
      const jitter = Math.random() * 0.3 + 0.85; // 0.85-1.15 para evitar sincronización
      const delay = initialDelay * Math.pow(backoffFactor, attempt - 1) * jitter;
      
      console.log(`[${operationName}] Waiting ${Math.round(delay)}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * Analiza y registra detalles específicos del error para diferentes tipos
 * @param error Error a analizar
 * @param context Contexto donde ocurrió el error
 */
export function logDetailedError(error: any, context: string = "Unknown"): void {
  console.error(`[${context}] Detailed error information:`);
  
  // Información general del error
  console.error(`- Message: ${error.message || 'No message'}`);
  console.error(`- Type: ${error.name || error.constructor?.name || 'Unknown'}`);
  
  // Información específica de errores ethers/blockchain
  if (error.code) console.error(`- Error code: ${error.code}`);
  if (error.reason) console.error(`- Error reason: ${error.reason}`);
  if (error.method) console.error(`- Method: ${error.method}`);
  if (error.transaction) {
    console.error(`- Transaction info:`);
    console.error(`  - From: ${error.transaction.from || 'unknown'}`);
    console.error(`  - To: ${error.transaction.to || 'unknown'}`);
    console.error(`  - Value: ${error.transaction.value || '0'}`);
    console.error(`  - Gas limit: ${error.transaction.gasLimit?.toString() || 'unknown'}`);
    console.error(`  - Gas price: ${error.transaction.gasPrice?.toString() || 'unknown'}`);
  }
  
  // Stack trace
  if (error.stack) {
    console.error('- Stack trace:');
    const stackLines = error.stack.split('\n').slice(0, 5); // Primeras 5 líneas
    stackLines.forEach((line: string) => console.error(`  ${line.trim()}`));
    if (error.stack.split('\n').length > 5) {
      console.error('  ... (stack trace truncated)');
    }
  }
  
  // Información adicional si está disponible
  if (error.data) console.error(`- Additional data:`, error.data);
}
