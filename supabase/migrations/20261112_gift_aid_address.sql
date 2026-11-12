-- Gift Aid address capture on donations
-- Required by HMRC: charity must hold donor's home address to claim Gift Aid

alter table public.donations
  add column if not exists gift_aid_address text,     -- "{house}, {postcode}" or full line
  add column if not exists gift_aid_declared_at timestamptz; -- when the donor submitted the declaration

comment on column public.donations.gift_aid_address is
  'Home address provided by donor for HMRC Gift Aid claim. Stored only when gift_aid = true.';
comment on column public.donations.gift_aid_declared_at is
  'UTC timestamp when donor completed the Gift Aid declaration on the giving page.';
