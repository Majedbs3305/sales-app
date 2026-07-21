-- انسخ هذا الكود كامل والصقه في Supabase → SQL Editor → Run
-- هذا الإصدار يمنع أي وصول لجدول sales إلا بعد التحقق من كلمة مرور الفريق

create extension if not exists pgcrypto;

create table sales (
  id uuid default gen_random_uuid() primary key,
  seller text not null,
  buyer text not null,
  qty numeric not null,
  amount numeric not null,
  time timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- جدول يخزّن هاش كلمة المرور المشتركة فقط (مو الكلمة نفسها كنص صريح)
create table app_secrets (
  key text primary key,
  value text not null
);

-- غيّر القيمة 'CHANGE_ME_1234' إلى كلمة المرور اللي تبي الفريق يستخدمها، ثم شغّل هذا السطر
insert into app_secrets (key, value)
values ('team_password_hash', crypt('CHANGE_ME_1234', gen_salt('bf')));

-- منع أي وصول مباشر لهذا الجدول من الواجهة نهائيًا
alter table app_secrets enable row level security;
-- (لا نضيف أي policy = ممنوع الوصول تمامًا، حتى بالـ anon key)

-- دالة تتحقق من كلمة المرور، وإذا صحيحة تصدر توكن جلسة صالح لمدة 12 ساعة
create or replace function login_with_password(input_password text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  is_valid boolean;
  session_token text;
begin
  select (value = crypt(input_password, value)) into is_valid
  from app_secrets where key = 'team_password_hash';

  if not is_valid then
    raise exception 'كلمة المرور غير صحيحة';
  end if;

  session_token := encode(gen_random_bytes(24), 'hex');

  insert into app_sessions (token, expires_at)
  values (session_token, now() + interval '12 hours');

  return session_token;
end;
$$;

-- جدول جلسات صالحة مؤقتًا (بدل تخزين كلمة المرور بالمتصفح)
create table app_sessions (
  token text primary key,
  expires_at timestamptz not null
);
alter table app_sessions enable row level security;
-- ممنوع الوصول المباشر لهذا الجدول أيضًا

-- دالة تتحقق أن التوكن المُرسل من المتصفح صالح وغير منتهي
create or replace function is_session_valid(input_token text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from app_sessions
    where token = input_token and expires_at > now()
  );
$$;

-- تفعيل الحماية على جدول المبيعات: أي عملية قراءة/كتابة/حذف
-- لازم تمرر توكن جلسة صالح عبر إعداد request.headers المخصص
alter table sales enable row level security;

create policy "Require valid session token" on sales
  for all
  using ( is_session_valid( current_setting('request.headers', true)::json->>'x-session-token' ) )
  with check ( is_session_valid( current_setting('request.headers', true)::json->>'x-session-token' ) );

alter publication supabase_realtime add table sales;

-- تنظيف دوري للجلسات المنتهية (اختياري، يمكن تشغيله يدويًا بين فترة وأخرى)
-- delete from app_sessions where expires_at < now();
