-- platform_settings: key-value store for brand/config parameters
create table if not exists public.platform_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

alter table public.platform_settings enable row level security;

create policy "platform_settings: public read"
  on public.platform_settings for select using (true);

-- Only platform admins may write
create policy "platform_settings: admin write"
  on public.platform_settings for all
  using (
    exists (
      select 1 from public.platform_admins
      where user_id = auth.uid()
    )
  );

-- Seed Donorbook defaults (no-op if key already exists)
insert into public.platform_settings (key, value) values
  ('app_name',          'Donorbook'),
  ('app_tagline',       'Donor management for small UK charities'),
  ('app_url',           'https://donorbook.co.uk'),
  ('support_email',     'support@donorbook.co.uk'),
  ('from_email',        'noreply@donorbook.co.uk'),
  ('legal_email',       'legal@donorbook.co.uk'),
  ('company_name',      'Donorbook'),
  ('company_address',   'Donorbook, England, United Kingdom'),
  ('platform_currency', 'GBP'),
  ('demo_slug',         'sunrise-childrens-foundation')
on conflict (key) do nothing;
