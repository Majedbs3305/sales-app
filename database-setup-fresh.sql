-- انسخ هذا الكود كامل والصقه في Supabase → SQL Editor → Run
-- هذا للتثبيت الجديد بالكامل (مشروع Supabase فاضي تمامًا)
-- إذا عندك بيانات موجودة أصلاً، لا تستخدم هذا الملف — استخدم database-migration-2.sql بدلاً منه

create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to postgres, anon, authenticated, service_role;

-- جدول الدفاتر (كل دفتر = سوق/متجر منفصل)
create table notebooks (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  created_at timestamptz not null default now()
);

insert into notebooks (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'الدفتر الأول');

create table sales (
  id uuid default gen_random_uuid() primary key,
  notebook_id uuid not null references notebooks(id) default '00000000-0000-0000-0000-000000000001',
  seller text not null,
  buyer text not null,
  qty numeric not null,
  amount numeric not null,
  notes text,
  mesh_number text,
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

alter table app_secrets enable row level security;
-- (لا نضيف أي policy = ممنوع الوصول تمامًا، حتى بالـ anon key)

-- جدول جلسات صالحة مؤقتًا (بدل تخزين كلمة المرور بالمتصفح)
create table app_sessions (
  token text primary key,
  expires_at timestamptz not null
);
alter table app_sessions enable row level security;

-- عداد المحاولات الخاطئة وقفل مؤقت بعد 5 محاولات
create table login_attempts (
  id int primary key default 1,
  failed_count int not null default 0,
  locked_until timestamptz
);
insert into login_attempts (id, failed_count, locked_until) values (1, 0, null);
alter table login_attempts enable row level security;

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

-- دالة تسجيل الدخول: تتحقق من القفل، تعد المحاولات الخاطئة، وتقفل 5 دقايق بعد 5 محاولات
create or replace function login_with_password(input_password text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  is_valid boolean;
  session_token text;
  current_locked_until timestamptz;
  current_failed_count int;
begin
  select locked_until, failed_count into current_locked_until, current_failed_count
  from login_attempts where id = 1;

  if current_locked_until is not null and current_locked_until > now() then
    raise exception 'الحساب مقفول مؤقتًا، حاول بعد % ثانية',
      ceil(extract(epoch from (current_locked_until - now())));
  end if;

  select (value = extensions.crypt(input_password, value)) into is_valid
  from app_secrets where key = 'team_password_hash';

  if not is_valid then
    update login_attempts
    set failed_count = failed_count + 1,
        locked_until = case when failed_count + 1 >= 5 then now() + interval '5 minutes' else null end
    where id = 1;

    if current_failed_count + 1 >= 5 then
      raise exception 'كلمة المرور غير صحيحة. تم قفل الدخول 5 دقايق بسبب المحاولات المتكررة';
    else
      raise exception 'كلمة المرور غير صحيحة (محاولة % من 5)', current_failed_count + 1;
    end if;
  end if;

  update login_attempts set failed_count = 0, locked_until = null where id = 1;

  session_token := encode(gen_random_bytes(24), 'hex');

  insert into app_sessions (token, expires_at)
  values (session_token, now() + interval '12 hours');

  return session_token;
end;
$$;

-- تفعيل الحماية: أي عملية قراءة/كتابة/حذف لازم تمرر توكن جلسة صالح
alter table sales enable row level security;
create policy "Require valid session token" on sales
  for all
  using ( is_session_valid( current_setting('request.headers', true)::json->>'x-session-token' ) )
  with check ( is_session_valid( current_setting('request.headers', true)::json->>'x-session-token' ) );

alter table notebooks enable row level security;
create policy "Require valid session token" on notebooks
  for all
  using ( is_session_valid( current_setting('request.headers', true)::json->>'x-session-token' ) )
  with check ( is_session_valid( current_setting('request.headers', true)::json->>'x-session-token' ) );

alter publication supabase_realtime add table sales;
alter publication supabase_realtime add table notebooks;
