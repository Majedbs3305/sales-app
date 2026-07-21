-- ==========================================================
-- ترقية قاعدة البيانات: دفاتر متعددة + ملاحظات + رقم شبك + قفل بعد محاولات خاطئة
-- انسخ هذا الكود كامل والصقه في Supabase → SQL Editor → Run
-- (هذا يُشغَّل مرة وحدة فقط على قاعدة بيانات موجودة أصلاً)
-- ==========================================================

-- 1) جدول الدفاتر (كل دفتر = سوق/متجر منفصل)
create table notebooks (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  created_at timestamptz not null default now()
);

alter table notebooks enable row level security;

create policy "Require valid session token" on notebooks
  for all
  using ( is_session_valid( current_setting('request.headers', true)::json->>'x-session-token' ) )
  with check ( is_session_valid( current_setting('request.headers', true)::json->>'x-session-token' ) );

alter publication supabase_realtime add table notebooks;

-- دفتر افتراضي أول، عشان العمليات القديمة تنربط فيه
insert into notebooks (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'الدفتر الأول');

-- 2) إضافة الأعمدة الجديدة لجدول sales
alter table sales add column notebook_id uuid references notebooks(id) default '00000000-0000-0000-0000-000000000001';
alter table sales add column notes text;
alter table sales add column mesh_number text;

-- تحديث العمليات القديمة (لو فيه) تنربط بالدفتر الافتراضي
update sales set notebook_id = '00000000-0000-0000-0000-000000000001' where notebook_id is null;

alter table sales alter column notebook_id set not null;

-- 3) نظام القفل بعد محاولات خاطئة متتالية
create table login_attempts (
  id int primary key default 1,
  failed_count int not null default 0,
  locked_until timestamptz
);
insert into login_attempts (id, failed_count, locked_until) values (1, 0, null);

alter table login_attempts enable row level security;
-- ممنوع الوصول المباشر، فقط عبر الدالة تحت

-- دالة تسجيل الدخول المحدّثة: تتحقق من القفل، تعد المحاولات الخاطئة، وتقفل 5 دقايق بعد 5 محاولات
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

  -- لو مقفول ولسا ما خلصت مدة القفل
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

  -- نجح الدخول: نصفّر عداد المحاولات
  update login_attempts set failed_count = 0, locked_until = null where id = 1;

  session_token := encode(gen_random_bytes(24), 'hex');

  insert into app_sessions (token, expires_at)
  values (session_token, now() + interval '12 hours');

  return session_token;
end;
$$;
