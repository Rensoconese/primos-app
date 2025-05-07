import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Configuración mejorada para evitar errores 406
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: {
    schema: 'public'
  },
  global: {
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey
    }
  }
});

export const testConnection = async () => {
  try {
    const { data, error } = await supabase.from('health_check').select('*').limit(1);
    
    if (error) throw error;
    
    console.log('Supabase connection successful:', data);
    return { success: true, data };
  } catch (error) {
    console.error('Supabase connection error:', error);
    return { success: false, error };
  }
};
