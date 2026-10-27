create table if not exists public.users (id text primary key,email text unique not null,name text not null,password text not null,role text not null,created bigint not null);
create table if not exists public.sessions (token text primary key,user_id text not null references public.users(id) on delete cascade,expires bigint not null);
create table if not exists public.attempts (key text primary key,count integer not null,until bigint not null);
create table if not exists public.materials (id text primary key,owner text not null references public.users(id) on delete cascade,title text not null,grade integer not null,subject text not null,kind text not null,content text not null,published integer not null default 0,created bigint not null);
create table if not exists public.attachments (id text primary key,owner text not null references public.users(id) on delete cascade,name text not null,mime text not null,data text not null,created bigint not null);
create index if not exists sessions_user_idx on public.sessions(user_id);
create index if not exists materials_owner_idx on public.materials(owner);
create index if not exists attachments_owner_idx on public.attachments(owner);
