-- Organizations may only use a company or education email.
--
--   is_allowed_org_email(text)   true when the address is well formed and its
--                                domain is not a free mailbox provider
--   organizations_check_emails   BEFORE INSERT OR UPDATE OF contact_email:
--                                rejects a blocked official email, and a blocked
--                                address on the owner's auth.users row
--
-- The blocked free providers are listed once, here, and match FREE_EMAIL_DOMAINS
-- in src/lib/organizations.js. Everything else is allowed, which covers company
-- domains and institutions (.edu, .edu.xx, .ac.xx).
--
-- Existing rows are left alone: the check only runs for new rows and for updates
-- that touch contact_email. "Individual organizer" is gone from the form but is
-- still a valid org_type, so older rows stay valid.
--
-- Safe to re-run: the function is replaced and the trigger is dropped first.

-- ---------------------------------------------------------------------------
-- 1. The rule
-- ---------------------------------------------------------------------------

create or replace function public.is_allowed_org_email(p_email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when nullif(trim(coalesce(p_email, '')), '') is null then false
    when trim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[A-Za-z]{2,}$' then false
    else lower(split_part(trim(p_email), '@', 2)) not in (
      'gmail.com',
      'googlemail.com',
      'yahoo.com',
      'yahoo.in',
      'ymail.com',
      'outlook.com',
      'hotmail.com',
      'live.com',
      'msn.com',
      'icloud.com',
      'me.com',
      'proton.me',
      'protonmail.com',
      'aol.com',
      'gmx.com',
      'zoho.com',
      'rediffmail.com',
      'mail.com',
      'yandex.com',
      'tutanota.com'
    )
  end;
$$;

revoke all on function public.is_allowed_org_email(text) from public, anon;
grant execute on function public.is_allowed_org_email(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The guard: the official email and the owner's sign-in address both have to
--    be a company or college address.
-- ---------------------------------------------------------------------------

create or replace function public.check_organization_emails()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_email text;
begin
  if not public.is_allowed_org_email(new.contact_email) then
    raise exception
      'Organizations need a company or college email. The official email % is not accepted.',
      new.contact_email
      using errcode = '23514';
  end if;

  select u.email into owner_email
  from auth.users u
  where u.id = new.owner_id;

  if owner_email is not null and not public.is_allowed_org_email(owner_email) then
    raise exception
      'Organizations need a company or college email. Your sign-in address % is not accepted — use your company or college email instead.',
      owner_email
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.check_organization_emails() from public, anon, authenticated;

drop trigger if exists organizations_check_emails on public.organizations;
create trigger organizations_check_emails
  before insert or update of contact_email on public.organizations
  for each row execute function public.check_organization_emails();
