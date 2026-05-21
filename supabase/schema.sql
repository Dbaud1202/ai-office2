-- AI Office 2 Supabase schema
-- Run this in Supabase Dashboard > SQL Editor.

create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  display_name text,
  created_at timestamptz default now()
);

create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

create table if not exists subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  plan text default 'free' check (plan in ('free', 'pro', 'team')),
  stripe_customer_id text,
  stripe_subscription_id text,
  expires_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists subscriptions_user on subscriptions(user_id);

create table if not exists messages (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  channel_id text not null,
  role text not null check (role in ('user', 'agent', 'system')),
  agent_id text,
  content text not null,
  timestamp timestamptz default now(),
  tools_used text[] default '{}',
  is_streaming boolean default false
);

create index if not exists messages_user_channel on messages(user_id, channel_id);
create index if not exists messages_timestamp on messages(timestamp desc);

create table if not exists vault_notes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  path text not null,
  content text not null,
  frontmatter jsonb default '{}',
  updated_at timestamptz default now(),
  unique(user_id, path)
);

create index if not exists vault_notes_user on vault_notes(user_id);

alter table profiles enable row level security;
alter table subscriptions enable row level security;
alter table messages enable row level security;
alter table vault_notes enable row level security;

drop policy if exists "own profile" on profiles;
drop policy if exists "own subscriptions" on subscriptions;
drop policy if exists "own messages" on messages;
drop policy if exists "own vault notes" on vault_notes;

create policy "own profile" on profiles
  for all using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "own subscriptions" on subscriptions
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own messages" on messages
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own vault notes" on vault_notes
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Required .env values:
-- VITE_SUPABASE_URL=https://xxxx.supabase.co
-- VITE_SUPABASE_ANON_KEY=eyJ...
--
-- Development note:
-- Without these env vars the app runs in local-only Pro mode.
