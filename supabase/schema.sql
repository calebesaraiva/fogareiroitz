do $$
begin
  create type public.user_role as enum ('user', 'admin');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.order_type as enum ('dine_in', 'takeaway', 'reservation');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.order_status as enum ('new', 'preparing', 'ready', 'delivered', 'cancelled');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.users (
  id bigserial primary key,
  "openId" varchar(64) not null unique,
  name text,
  email varchar(320),
  "loginMethod" varchar(64),
  role public.user_role not null default 'user',
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "lastSignedIn" timestamptz not null default now()
);

create table if not exists public.categories (
  id bigserial primary key,
  name varchar(120) not null unique,
  slug varchar(140) not null unique,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists public.products (
  id bigserial primary key,
  "categoryId" bigint references public.categories(id) on delete set null,
  name varchar(255) not null,
  description text,
  price integer not null,
  "imageUrl" text,
  "imageKey" varchar(255),
  ingredients text,
  "isActive" boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists public.dining_tables (
  id bigserial primary key,
  number integer not null unique,
  label varchar(80),
  "isActive" boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists public.orders (
  id bigserial primary key,
  "customerName" varchar(160) not null,
  "customerPhone" varchar(40),
  "orderType" public.order_type not null,
  status public.order_status not null default 'new',
  "tableId" bigint references public.dining_tables(id) on delete set null,
  notes text,
  "guestCount" integer,
  "reservationAt" timestamptz,
  total integer not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists public.order_items (
  id bigserial primary key,
  "orderId" bigint not null references public.orders(id) on delete cascade,
  "productId" bigint references public.products(id) on delete set null,
  "productName" varchar(255) not null,
  quantity integer not null,
  "unitPrice" integer not null,
  "totalPrice" integer not null,
  "imageUrl" text,
  customization varchar(80),
  observations text,
  "createdAt" timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new."updatedAt" = now();
  return new;
end;
$$;

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at
before update on public.users
for each row
execute function public.set_updated_at();

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
before update on public.products
for each row
execute function public.set_updated_at();

drop trigger if exists set_categories_updated_at on public.categories;
create trigger set_categories_updated_at
before update on public.categories
for each row
execute function public.set_updated_at();

drop trigger if exists set_dining_tables_updated_at on public.dining_tables;
create trigger set_dining_tables_updated_at
before update on public.dining_tables
for each row
execute function public.set_updated_at();

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at
before update on public.orders
for each row
execute function public.set_updated_at();

insert into public.dining_tables (number, label)
select s, concat('Mesa ', s)
from generate_series(1, 20) s
on conflict (number) do nothing;
