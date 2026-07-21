import { createClient } from '@supabase/supabase-js';

// عبّي هذي القيم من إعدادات مشروعك في Supabase (Settings > API)
const SUPABASE_URL = 'https://xjolqqfawsxwawxfljtb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_gi24FzgJxOnX9whF22PYyw_Fr2ztpZM';


const SESSION_KEY = 'sales_app_session_token';

export function getStoredToken() {
  return localStorage.getItem(SESSION_KEY);
}

export function storeToken(token) {
  localStorage.setItem(SESSION_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(SESSION_KEY);
}

// ننشئ عميل Supabase جديد حسب التوكن الحالي، عشان يُرسل
// كـ header مخصص مع كل طلب فيتحقق منه RLS في قاعدة البيانات
export function createSupabaseClient(token) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: token ? { 'x-session-token': token } : {},
    },
  });
}

// عميل بدون توكن، يُستخدم فقط لاستدعاء دالة تسجيل الدخول
export const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function login(password) {
  const { data, error } = await authClient.rpc('login_with_password', {
    input_password: password,
  });
  if (error) {
    // نعرض رسالة الخطأ الحقيقية القادمة من قاعدة البيانات (فيها عداد المحاولات أو مدة القفل)
    throw new Error(error.message || 'كلمة المرور غير صحيحة');
  }
  storeToken(data);
  return data;
}
