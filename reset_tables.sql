-- Script para resetear todas las tablas relevantes a un estado inicial limpio

-- 1. Resetear la tabla leaderboard (ya lo has hecho, pero lo incluyo por completitud)
UPDATE public.leaderboard
SET 
  tokens_claimed = 0,
  points_earned = 0,
  best_streak = 0,
  current_streak = 0,
  nft_count = 0,
  updated_at = NOW()
WHERE 
  wallet_address IS NOT NULL;

-- 2. Resetear la tabla users (esto es crítico para el cálculo correcto de streaks)
UPDATE public.users
SET 
  current_streak = 0,
  max_streak = 0,
  total_points = 0,
  total_check_ins = 0
WHERE 
  wallet_address IS NOT NULL;

-- 3. Limpiar la tabla rewards (opcional, pero recomendado)
-- Esto evitará que se acumulen tokens_claimed incorrectos
DELETE FROM public.rewards;

-- 4. Limpiar la tabla check_ins (opcional, pero recomendado)
-- Esto evitará inconsistencias en el historial de check-ins
DELETE FROM public.check_ins;

-- 5. Limpiar la tabla nft_usage_tracking (opcional, pero recomendado)
-- Esto permitirá que los usuarios utilicen sus NFTs en el próximo check-in
DELETE FROM public.nft_usage_tracking;

-- 6. Limpiar la tabla pending_rewards (opcional)
-- Esto elimina cualquier recompensa pendiente que podría causar confusiones
DELETE FROM public.pending_rewards;
