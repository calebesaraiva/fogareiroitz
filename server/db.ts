import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  appSettings,
  categories,
  diningTables,
  InsertOrder,
  InsertOrderItem,
  InsertProduct,
  InsertUser,
  orderItems,
  orders,
  products,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;
let _client: postgres.Sql | null = null;
let _schemaReady: Promise<void> | null = null;
const DEFAULT_AUTO_PREPARING_PERCENT = 15;
const DEFAULT_AUTO_DELIVERED_GRACE_MINUTES = 8;
const DEFAULT_SHOWCASE_SLIDE_SECONDS = 6;
const DEFAULT_SHOWCASE_TITLE = "Fogareiro ITZ Restaurante";
const DEFAULT_SHOWCASE_SUBTITLE = "Cardapio da casa";
const DEFAULT_SERVICE_FEE_PERCENT = 10;

type ShowcaseSlide = {
  id: string;
  title: string;
  imageUrl: string;
  durationSeconds: number;
  isActive: boolean;
};

function normalizeShowcaseSlides(input: unknown): ShowcaseSlide[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((slide, index) => {
      if (!slide || typeof slide !== "object") return null;
      const raw = slide as Record<string, unknown>;
      const imageUrl = String(raw.imageUrl ?? "").trim();
      if (!imageUrl) return null;

      const title = String(raw.title ?? "").trim() || `Slide ${index + 1}`;
      const durationSeconds = Math.min(
        30,
        Math.max(3, Number(raw.durationSeconds ?? DEFAULT_SHOWCASE_SLIDE_SECONDS) || DEFAULT_SHOWCASE_SLIDE_SECONDS)
      );

      return {
        id: String(raw.id ?? `slide-${index + 1}`),
        title,
        imageUrl,
        durationSeconds,
        isActive: raw.isActive !== false,
      } as ShowcaseSlide;
    })
    .filter((slide): slide is ShowcaseSlide => Boolean(slide))
    .slice(0, 60);
}

function parseShowcaseSlidesJson(value: string | null | undefined) {
  if (!value) return [];
  try {
    return normalizeShowcaseSlides(JSON.parse(value));
  } catch {
    return [];
  }
}

const ORDER_STATUS_RANK: Record<NonNullable<InsertOrder["status"]>, number> = {
  pending: 0,
  new: 1,
  preparing: 2,
  ready: 3,
  delivered: 4,
  cancelled: 5,
};

export type ProductRecord = typeof products.$inferSelect & {
  categoryName: string | null;
};

export type OrderRecord = typeof orders.$inferSelect & {
  tableNumber: number | null;
  tableLabel: string | null;
  items: Array<typeof orderItems.$inferSelect>;
};

export type CashierOrderRecord = OrderRecord & {
  serviceFeeDefault: number;
};

type ProductPayload = Omit<InsertProduct, "categoryId"> & {
  categoryName?: string | null;
};

type OrderItemPayload = {
  productId?: number | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  imageUrl?: string | null;
  customization?: string | null;
  observations?: string | null;
};

type CreateOrderPayload = {
  customerName: string;
  customerPhone?: string | null;
  orderType: InsertOrder["orderType"];
  status?: InsertOrder["status"];
  tableId?: number | null;
  estimatedReadyMinutes?: number | null;
  notes?: string | null;
  guestCount?: number | null;
  reservationAt?: Date | null;
  total: number;
  items: OrderItemPayload[];
};

type UpdateOrderDetailsPayload = {
  customerName: string;
  customerPhone?: string | null;
  notes?: string | null;
  total: number;
  items: OrderItemPayload[];
};

type LocalUserPayload = {
  name: string;
  email: string;
  password: string;
  role: "admin" | "kitchen" | "waiter" | "cashier";
};

type DiningTablePayload = {
  number: number;
  label?: string | null;
  isActive?: boolean;
};

type PaymentMethod = "cash" | "card" | "pix";

function createTrackingCode() {
  return `FGR-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
}

function createPublicTableToken() {
  return `mesa_${randomBytes(18).toString("hex")}`;
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

async function getAutoStatusConfig(db: ReturnType<typeof drizzle>) {
  const [settings] = await db.select().from(appSettings).limit(1);

  if (!settings) {
    const [created] = await db
      .insert(appSettings)
      .values({
        autoPreparingPercent: DEFAULT_AUTO_PREPARING_PERCENT,
        autoDeliveredGraceMinutes: DEFAULT_AUTO_DELIVERED_GRACE_MINUTES,
        showcaseSlideSeconds: DEFAULT_SHOWCASE_SLIDE_SECONDS,
        showcaseTitle: DEFAULT_SHOWCASE_TITLE,
        showcaseSubtitle: DEFAULT_SHOWCASE_SUBTITLE,
      })
      .returning();

    return created;
  }

  return settings;
}

function getTimedAutoStatus(
  order: typeof orders.$inferSelect,
  nowTs: number,
  autoPreparingPercent: number,
  autoDeliveredGraceMinutes: number
): InsertOrder["status"] {
  if (!order.estimatedReadyMinutes) return order.status;
  if (order.status === "pending" || order.status === "cancelled" || order.status === "delivered") {
    return order.status;
  }

  const estimatedMs = Math.max(1, Number(order.estimatedReadyMinutes)) * 60_000;
  const elapsedMs = Math.max(0, nowTs - new Date(order.createdAt).getTime());
  const preparingThreshold = Math.max(0, Math.min(100, autoPreparingPercent)) / 100;
  const deliveredGraceMs = Math.max(0, autoDeliveredGraceMinutes) * 60_000;

  let nextStatus: InsertOrder["status"] = "new";
  if (elapsedMs >= estimatedMs + deliveredGraceMs) {
    nextStatus = "delivered";
  } else if (elapsedMs >= estimatedMs) {
    nextStatus = "ready";
  } else if (elapsedMs >= estimatedMs * preparingThreshold) {
    nextStatus = "preparing";
  }

  if (ORDER_STATUS_RANK[nextStatus] < ORDER_STATUS_RANK[order.status]) {
    return order.status;
  }

  return nextStatus;
}

async function syncTimedOrderStatuses(db: ReturnType<typeof drizzle>) {
  const settings = await getAutoStatusConfig(db);
  const baseOrders = await db
    .select()
    .from(orders)
    .where(inArray(orders.status, ["new", "preparing", "ready"]));

  if (baseOrders.length === 0) return;

  const nowTs = Date.now();
  const updates = baseOrders
    .map((order) => ({
      id: Number(order.id),
      nextStatus: getTimedAutoStatus(
        order,
        nowTs,
        Number(settings.autoPreparingPercent ?? DEFAULT_AUTO_PREPARING_PERCENT),
        Number(settings.autoDeliveredGraceMinutes ?? DEFAULT_AUTO_DELIVERED_GRACE_MINUTES)
      ),
      currentStatus: order.status,
    }))
    .filter((entry) => entry.nextStatus !== entry.currentStatus);

  if (updates.length === 0) return;

  await Promise.all(
    updates.map((entry) =>
      db
        .update(orders)
        .set({
          status: entry.nextStatus,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, entry.id))
    )
  );
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string) {
  const [salt, expectedHash] = storedHash.split(":");
  if (!salt || !expectedHash) return false;

  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, "hex");

  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

function slugifyCategory(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
}

async function ensureAppSchema(sql: postgres.Sql) {
  await sql`
    do $$
    begin
      create type public.user_role as enum ('user', 'admin', 'kitchen');
    exception
      when duplicate_object then null;
    end $$;
  `;

  await sql`
    do $$
    begin
      alter type public.user_role add value if not exists 'kitchen';
    exception
      when duplicate_object then null;
    end $$;
  `;

  await sql`
    do $$
    begin
      alter type public.user_role add value if not exists 'waiter';
    exception
      when duplicate_object then null;
    end $$;
  `;

  await sql`
    do $$
    begin
      alter type public.user_role add value if not exists 'cashier';
    exception
      when duplicate_object then null;
    end $$;
  `;

  await sql`
    create table if not exists public.users (
      id bigserial primary key,
      "openId" varchar(64) not null unique,
      name text,
      email varchar(320),
      "loginMethod" varchar(64),
      "passwordHash" varchar(255),
      role public.user_role not null default 'user',
      "isActive" boolean not null default true,
      "createdAt" timestamptz not null default now(),
      "updatedAt" timestamptz not null default now(),
      "lastSignedIn" timestamptz not null default now()
    )
  `;

  await sql`
    alter table public.users
    add column if not exists "passwordHash" varchar(255)
  `;

  await sql`
    alter table public.users
    add column if not exists "isActive" boolean not null default true
  `;

  await sql`
    do $$
    begin
      create type public.order_type as enum ('dine_in', 'takeaway', 'reservation');
    exception
      when duplicate_object then null;
    end $$;
  `;

  await sql`
    do $$
    begin
      create type public.order_status as enum ('pending', 'new', 'preparing', 'ready', 'delivered', 'cancelled');
    exception
      when duplicate_object then null;
    end $$;
  `;

  await sql`
    do $$
    begin
      alter type public.order_status add value if not exists 'pending' before 'new';
    exception
      when duplicate_object then null;
    end $$;
  `;

  await sql`
    create table if not exists public.categories (
      id bigserial primary key,
      name varchar(120) not null unique,
      slug varchar(140) not null unique,
      "createdAt" timestamptz not null default now(),
      "updatedAt" timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists public.products (
      id bigserial primary key,
      "categoryId" bigint references public.categories(id) on delete set null,
      name varchar(255) not null,
      description text,
      price integer not null,
      "imageUrl" text,
      "imageFit" varchar(24) not null default 'cover',
      "imageKey" varchar(255),
      ingredients text,
      "isActive" boolean not null default true,
      "createdAt" timestamptz not null default now(),
      "updatedAt" timestamptz not null default now()
    )
  `;

  await sql`
    alter table public.products
    add column if not exists "categoryId" bigint references public.categories(id) on delete set null
  `;

  await sql`
    alter table public.products
    add column if not exists "imageFit" varchar(24) not null default 'cover'
  `;

  await sql`
    create table if not exists public.dining_tables (
      id bigserial primary key,
      number integer not null unique,
      label varchar(80),
      "publicToken" varchar(48),
      "isActive" boolean not null default true,
      "createdAt" timestamptz not null default now(),
      "updatedAt" timestamptz not null default now()
    )
  `;

  await sql`
    alter table public.dining_tables
    add column if not exists "publicToken" varchar(48)
  `;

  await sql`
    create table if not exists public.orders (
      id bigserial primary key,
      "trackingCode" varchar(24) not null unique,
      "customerName" varchar(160) not null,
      "customerPhone" varchar(40),
      "orderType" public.order_type not null,
      status public.order_status not null default 'new',
      "tableId" bigint references public.dining_tables(id) on delete set null,
      "estimatedReadyMinutes" integer,
      notes text,
      "guestCount" integer,
      "reservationAt" timestamptz,
      total integer not null,
      "isPaid" boolean not null default false,
      "paidAt" timestamptz,
      "serviceFeeApplied" boolean not null default true,
      "serviceFeeAmount" integer not null default 0,
      "discountAmount" integer not null default 0,
      "discountAuthorizedBy" varchar(320),
      "paidTotal" integer,
      "createdAt" timestamptz not null default now(),
      "updatedAt" timestamptz not null default now()
    )
  `;

  await sql`
    alter table public.orders
    add column if not exists "trackingCode" varchar(24)
  `;

  await sql`
    alter table public.orders
    add column if not exists "estimatedReadyMinutes" integer
  `;

  await sql`
    alter table public.orders
    add column if not exists "isPaid" boolean not null default false
  `;

  await sql`
    alter table public.orders
    add column if not exists "paidAt" timestamptz
  `;

  await sql`
    alter table public.orders
    add column if not exists "serviceFeeApplied" boolean not null default true
  `;

  await sql`
    alter table public.orders
    add column if not exists "serviceFeeAmount" integer not null default 0
  `;

  await sql`
    alter table public.orders
    add column if not exists "discountAmount" integer not null default 0
  `;

  await sql`
    alter table public.orders
    add column if not exists "discountAuthorizedBy" varchar(320)
  `;

  await sql`
    alter table public.orders
    add column if not exists "paidTotal" integer
  `;

  await sql`
    alter table public.orders
    add column if not exists "paymentMethod" varchar(24)
  `;

  await sql`
    alter table public.orders
    add column if not exists "amountReceived" integer
  `;

  await sql`
    alter table public.orders
    add column if not exists "changeDue" integer
  `;

  await sql`
    create table if not exists public.app_settings (
      id bigserial primary key,
      "autoPreparingPercent" integer not null default 15,
      "autoDeliveredGraceMinutes" integer not null default 8,
      "showcaseSlidesJson" text,
      "showcaseSlideSeconds" integer not null default 6,
      "showcaseTitle" varchar(160),
      "showcaseSubtitle" varchar(160),
      "updatedAt" timestamptz not null default now()
    )
  `;

  await sql`
    alter table public.app_settings
    add column if not exists "showcaseSlidesJson" text
  `;

  await sql`
    alter table public.app_settings
    add column if not exists "showcaseSlideSeconds" integer not null default 6
  `;

  await sql`
    alter table public.app_settings
    add column if not exists "showcaseTitle" varchar(160)
  `;

  await sql`
    alter table public.app_settings
    add column if not exists "showcaseSubtitle" varchar(160)
  `;

  await sql`
    insert into public.app_settings ("autoPreparingPercent", "autoDeliveredGraceMinutes")
    select 15, 8
    where not exists (select 1 from public.app_settings)
  `;

  await sql`
    update public.orders
    set "customerPhone" = regexp_replace("customerPhone", '\D', '', 'g')
    where "customerPhone" is not null
  `;

  await sql`
    update public.orders
    set "trackingCode" = concat(
      'FGR-',
      upper(substr(md5(id::text || now()::text), 1, 6)),
      '-',
      upper(substr(md5(random()::text || id::text), 1, 4))
    )
    where "trackingCode" is null
  `;

  await sql`
    alter table public.orders
    alter column "trackingCode" set not null
  `;

  await sql`
    create unique index if not exists orders_tracking_code_unique
    on public.orders ("trackingCode")
  `;

  await sql`
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
    )
  `;

  await sql`
    insert into public.dining_tables (number, label, "publicToken")
    select
      s,
      concat('Mesa ', s),
      concat('mesa_', substr(md5(s::text || now()::text || random()::text), 1, 36))
    from generate_series(1, 20) s
    on conflict (number) do nothing
  `;

  await sql`
    update public.dining_tables
    set "publicToken" = concat('mesa_', substr(md5(number::text || random()::text || now()::text), 1, 36))
    where "publicToken" is null
  `;

  await sql`
    alter table public.dining_tables
    alter column "publicToken" set not null
  `;

  await sql`
    create unique index if not exists dining_tables_public_token_unique
    on public.dining_tables ("publicToken")
  `;
}

async function ensureUniqueSlug(baseName: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const baseSlug = slugifyCategory(baseName) || "categoria";
  let slug = baseSlug;
  let suffix = 1;

  while (true) {
    const existing = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, slug))
      .limit(1);

    if (existing.length === 0) {
      return slug;
    }

    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }
}

async function ensureCategoryId(categoryName?: string | null) {
  const normalized = categoryName?.trim();
  if (!normalized) return null;

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.name, normalized))
    .limit(1);

  if (existing.length > 0) {
    return existing[0].id;
  }

  const slug = await ensureUniqueSlug(normalized);
  const inserted = await db
    .insert(categories)
    .values({
      name: normalized,
      slug,
    })
    .returning({ id: categories.id });

  return inserted[0]?.id ?? null;
}

async function hydrateOrders(baseOrders: Array<typeof orders.$inferSelect>) {
  const db = await getDb();
  if (!db || baseOrders.length === 0) return [];

  const items = await db.select().from(orderItems).orderBy(asc(orderItems.id));
  const tables = await db.select().from(diningTables);
  const itemsByOrder = new Map<number, Array<typeof orderItems.$inferSelect>>();

  items.forEach((item) => {
    const orderIdKey = Number(item.orderId);
    const bucket = itemsByOrder.get(orderIdKey) ?? [];
    bucket.push(item);
    itemsByOrder.set(orderIdKey, bucket);
  });

  const tableById = new Map(tables.map((table) => [Number(table.id), table]));

  return baseOrders.map((order) => {
    const orderIdKey = Number(order.id);
    const table = order.tableId ? tableById.get(Number(order.tableId)) : null;
    return {
      ...order,
      tableNumber: table?.number ?? null,
      tableLabel: table?.label ?? null,
      items: itemsByOrder.get(orderIdKey) ?? [],
    };
  });
}

async function ensureDefaultLocalUsers() {
  const db = await getDb();
  if (!db) return;

  const defaults: LocalUserPayload[] = [
    {
      name: "Vania",
      email: "vania@fogareiroitz.com",
      password: "Fogareiro@Adm2026",
      role: "admin",
    },
    {
      name: "Norton",
      email: "norton@fogareiroitz.com",
      password: "Fogareiro@Adm2026",
      role: "admin",
    },
    {
      name: "Cozinha",
      email: "cozinha@fogareiroitz.com",
      password: "Fogareiro@Cozinha2026",
      role: "kitchen",
    },
    {
      name: "Caixa",
      email: "caixa@fogareiroitz.com",
      password: "Fogareiro@Caixa2026",
      role: "cashier",
    },
  ];

  for (const account of defaults) {
    const existing = await getUserByEmail(account.email);
    if (existing) continue;

    await createLocalUser(account);
  }
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _client = postgres(process.env.DATABASE_URL, {
        prepare: false,
      });

      if (!_schemaReady) {
        _schemaReady = ensureAppSchema(_client);
      }

      await _schemaReady;
      _db = drizzle(_client);
      await ensureDefaultLocalUsers();
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _client = null;
      _db = null;
      _schemaReady = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    updateSet.updatedAt = new Date();

    await db
      .insert(users)
      .values(values)
      .onConflictDoUpdate({
        target: users.openId,
        set: updateSet,
      });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;

  const normalizedEmail = normalizeEmail(email);
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function authenticateLocalUser(email: string, password: string) {
  const user = await getUserByEmail(email);
  if (!user || !user.passwordHash || !user.isActive) return null;

  const isValid = verifyPassword(password, user.passwordHash);
  if (!isValid) return null;

  await upsertUser({
    openId: user.openId,
    lastSignedIn: new Date(),
  });

  return getUserByOpenId(user.openId);
}

export async function createLocalUser(data: LocalUserPayload) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const normalizedEmail = normalizeEmail(data.email);
  const existing = await getUserByEmail(normalizedEmail);
  if (existing) {
    throw new Error("Ja existe um usuario com esse email");
  }

  const inserted = await db
    .insert(users)
    .values({
      openId: `local:${normalizedEmail}`,
      name: data.name.trim(),
      email: normalizedEmail,
      loginMethod: "local",
      passwordHash: hashPassword(data.password),
      role: data.role,
      isActive: true,
      lastSignedIn: new Date(),
    })
    .returning();

  return inserted[0];
}

export async function listLocalUsers() {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(users)
    .where(eq(users.loginMethod, "local"))
    .orderBy(asc(users.role), asc(users.name));
}

export async function updateLocalUser(
  id: number,
  data: Partial<Pick<typeof users.$inferInsert, "name" | "role" | "isActive">>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(users)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(users.id, id));

  const [updated] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return updated;
}

export async function updateLocalUserPassword(id: number, password: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(users)
    .set({
      passwordHash: hashPassword(password),
      updatedAt: new Date(),
    })
    .where(eq(users.id, id));

  const [updated] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return updated;
}

export async function getAllCategories() {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(categories).orderBy(asc(categories.name));
}

export async function getAllProducts(includeInactive = false): Promise<ProductRecord[]> {
  const db = await getDb();
  if (!db) return [];

  const query = db
    .select({
      id: products.id,
      categoryId: products.categoryId,
      name: products.name,
      description: products.description,
      price: products.price,
      imageUrl: products.imageUrl,
      imageFit: products.imageFit,
      imageKey: products.imageKey,
      ingredients: products.ingredients,
      isActive: products.isActive,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
      categoryName: categories.name,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .orderBy(asc(categories.name), asc(products.name));

  return includeInactive ? query : query.where(eq(products.isActive, true));
}

export async function getProductById(id: number): Promise<ProductRecord | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select({
      id: products.id,
      categoryId: products.categoryId,
      name: products.name,
      description: products.description,
      price: products.price,
      imageUrl: products.imageUrl,
      imageFit: products.imageFit,
      imageKey: products.imageKey,
      ingredients: products.ingredients,
      isActive: products.isActive,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
      categoryName: categories.name,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.id, id))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function createProduct(data: ProductPayload) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const categoryId = await ensureCategoryId(data.categoryName);
  const { categoryName: _ignored, ...productData } = data;

  return db.insert(products).values({
    ...productData,
    categoryId,
  });
}

export async function updateProduct(id: number, data: Partial<ProductPayload>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: Partial<InsertProduct> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };

  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.price !== undefined) updateData.price = data.price;
  if (data.imageUrl !== undefined) updateData.imageUrl = data.imageUrl;
  if (data.imageFit !== undefined) updateData.imageFit = data.imageFit;
  if (data.imageKey !== undefined) updateData.imageKey = data.imageKey;
  if (data.ingredients !== undefined) updateData.ingredients = data.ingredients;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if (data.categoryName !== undefined) {
    updateData.categoryId = await ensureCategoryId(data.categoryName);
  }

  return db.update(products).set(updateData).where(eq(products.id, id));
}

export async function deleteProduct(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .update(products)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(products.id, id));
}

export async function getActiveDiningTables() {
  const db = await getDb();
  if (!db) return [];
  await syncTimedOrderStatuses(db);

  const tables = await db
    .select()
    .from(diningTables)
    .where(eq(diningTables.isActive, true))
    .orderBy(asc(diningTables.number));

  const activeOrders = await db
    .select({ tableId: orders.tableId })
    .from(orders)
    .where(inArray(orders.status, ["pending", "new", "preparing", "ready"]));

  const occupiedTableIds = new Set(
    activeOrders
      .map((order) => order.tableId)
      .filter((tableId): tableId is number => typeof tableId === "number" && Number.isFinite(tableId))
      .map((tableId) => Number(tableId))
  );

  return tables.filter((table) => !occupiedTableIds.has(Number(table.id)));
}

export async function getDiningTableByPublicToken(
  publicToken: string,
  options?: { requireAvailable?: boolean }
) {
  const db = await getDb();
  if (!db) return undefined;
  await syncTimedOrderStatuses(db);

  const normalized = publicToken.trim();
  const [table] = await db
    .select()
    .from(diningTables)
    .where(eq(diningTables.publicToken, normalized))
    .limit(1);

  if (!table || !table.isActive) return undefined;

  if (options?.requireAvailable) {
    const [activeOrderUsingTable] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.tableId, Number(table.id)),
          inArray(orders.status, ["pending", "new", "preparing", "ready"])
        )
      )
      .limit(1);

    if (activeOrderUsingTable) return undefined;
  }

  return table;
}

export async function getAllDiningTables() {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(diningTables).orderBy(asc(diningTables.number));
}

export async function createDiningTable(data: DiningTablePayload) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const normalizedNumber = Number(data.number);
  if (!Number.isInteger(normalizedNumber) || normalizedNumber <= 0) {
    throw new Error("Numero de mesa invalido");
  }

  const normalizedLabel = data.label?.trim() || `Mesa ${data.number}`;

  const [existingTable] = await db
    .select()
    .from(diningTables)
    .where(eq(diningTables.number, normalizedNumber))
    .limit(1);

  if (existingTable) {
    if (existingTable.isActive) {
      throw new Error(`Mesa ${normalizedNumber} ja cadastrada`);
    }

    const [reactivatedTable] = await db
      .update(diningTables)
      .set({
        label: normalizedLabel,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(diningTables.id, Number(existingTable.id)))
      .returning();

    if (reactivatedTable) return reactivatedTable;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = createPublicTableToken();

    try {
      const [createdTable] = await db
        .insert(diningTables)
        .values({
          number: normalizedNumber,
          label: normalizedLabel,
          publicToken: token,
          isActive: data.isActive ?? true,
          updatedAt: new Date(),
        })
        .returning();

      return createdTable;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes("dining_tables_publicToken") || message.includes("publicToken")) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Nao foi possivel gerar um token unico para a mesa");
}

export async function createOrder(data: CreateOrderPayload) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.transaction(async (tx) => {
    const requestedProductIds = Array.from(
      new Set(
        data.items
          .map((item) => item.productId ?? null)
          .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
      )
    );

    const validProductIds = new Set<number>();

    if (requestedProductIds.length > 0) {
      const existingProducts = await tx
        .select({ id: products.id })
        .from(products)
        .where(inArray(products.id, requestedProductIds));

      existingProducts.forEach((product) => {
        validProductIds.add(Number(product.id));
      });
    }

    const [createdOrder] = await tx
      .insert(orders)
      .values({
        trackingCode: createTrackingCode(),
        customerName: data.customerName,
        customerPhone: data.customerPhone ? normalizePhone(data.customerPhone) : null,
        orderType: data.orderType,
        status: data.status ?? "pending",
        tableId: data.tableId ?? null,
        estimatedReadyMinutes: data.estimatedReadyMinutes ?? null,
        notes: data.notes ?? null,
        guestCount: data.guestCount ?? null,
        reservationAt: data.reservationAt ?? null,
        total: data.total,
      })
      .returning();

    if (!createdOrder) {
      throw new Error("Failed to create order");
    }

    const rows: InsertOrderItem[] = data.items.map((item) => ({
      orderId: createdOrder.id,
      productId:
        item.productId && validProductIds.has(Number(item.productId)) ? item.productId : null,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      imageUrl: item.imageUrl ?? null,
      customization: item.customization ?? null,
      observations: item.observations ?? null,
    }));

    if (rows.length > 0) {
      await tx.insert(orderItems).values(rows);
    }

    return createdOrder;
  });
}

export async function getAllOrders() {
  const db = await getDb();
  if (!db) return [];
  await syncTimedOrderStatuses(db);

  const baseOrders = await db.select().from(orders).orderBy(asc(orders.createdAt));
  const hydrated = await hydrateOrders(baseOrders);
  return hydrated.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getKitchenOrders() {
  return getAllOrders();
}

export async function getCashierOrders(): Promise<CashierOrderRecord[]> {
  const allOrders = await getAllOrders();
  return allOrders
    .filter((order) => order.status !== "cancelled" && !order.isPaid)
    .map((order) => ({
      ...order,
      serviceFeeDefault: DEFAULT_SERVICE_FEE_PERCENT,
    }));
}

export async function markOrderAsPaid(
  id: number,
  paymentMethod: PaymentMethod,
  removeServiceFee = false,
  amountReceived?: number | null,
  discountAmount = 0,
  discountAuthorizedBy?: string | null
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [existing] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!existing) {
    throw new Error("Pedido nao encontrado");
  }
  if (existing.status === "cancelled") {
    throw new Error("Pedido cancelado nao pode ser pago");
  }
  if (existing.isPaid) {
    throw new Error("Pedido ja foi pago");
  }

  const subtotal = Number(existing.total ?? 0);
  const serviceFeeApplied = !removeServiceFee;
  const serviceFeeAmount = serviceFeeApplied
    ? Math.round((subtotal * DEFAULT_SERVICE_FEE_PERCENT) / 100)
    : 0;
  const maxDiscount = subtotal + serviceFeeAmount;
  const normalizedDiscountAmount = Math.max(0, Math.min(maxDiscount, Number(discountAmount || 0)));
  const paidTotal = subtotal + serviceFeeAmount - normalizedDiscountAmount;
  const normalizedAmountReceived =
    paymentMethod === "cash" ? Math.max(0, Number(amountReceived ?? 0)) : paidTotal;

  if (paymentMethod === "cash" && normalizedAmountReceived < paidTotal) {
    throw new Error("Valor recebido em dinheiro nao pode ser menor que o total");
  }

  const changeDue = paymentMethod === "cash" ? normalizedAmountReceived - paidTotal : 0;

  await db
    .update(orders)
    .set({
      status: "delivered",
      isPaid: true,
      paidAt: new Date(),
      serviceFeeApplied,
      serviceFeeAmount,
      discountAmount: normalizedDiscountAmount,
      discountAuthorizedBy: normalizedDiscountAmount > 0 ? discountAuthorizedBy ?? null : null,
      paidTotal,
      paymentMethod,
      amountReceived: normalizedAmountReceived,
      changeDue,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, id));

  const [updated] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  return updated;
}

export async function getCashierReport(dateFrom: Date, dateTo: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const paidOrders = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.isPaid, true),
        gte(orders.paidAt, dateFrom),
        lte(orders.paidAt, dateTo)
      )
    )
    .orderBy(asc(orders.paidAt));

  const byMethod: Record<PaymentMethod, { count: number; total: number }> = {
    cash: { count: 0, total: 0 },
    card: { count: 0, total: 0 },
    pix: { count: 0, total: 0 },
  };

  let grossTotal = 0;
  let serviceFeeTotal = 0;

  paidOrders.forEach((order) => {
    const method = (order.paymentMethod as PaymentMethod | null) ?? "cash";
    const paidTotal = Number(order.paidTotal ?? order.total ?? 0);
    const serviceFee = Number(order.serviceFeeAmount ?? 0);

    byMethod[method].count += 1;
    byMethod[method].total += paidTotal;
    grossTotal += paidTotal;
    serviceFeeTotal += serviceFee;
  });

  return {
    dateFrom,
    dateTo,
    totals: {
      count: paidOrders.length,
      grossTotal,
      serviceFeeTotal,
      netWithoutService: grossTotal - serviceFeeTotal,
    },
    byMethod,
    orders: paidOrders,
  };
}

export async function closeCashierDay(referenceDate: Date) {
  const start = new Date(referenceDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(referenceDate);
  end.setHours(23, 59, 59, 999);
  return getCashierReport(start, end);
}

export async function getAppSettings() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const settings = await getAutoStatusConfig(db);
  const showcaseSlides = parseShowcaseSlidesJson(settings.showcaseSlidesJson);
  return {
    ...settings,
    showcaseSlideSeconds: Number(settings.showcaseSlideSeconds ?? DEFAULT_SHOWCASE_SLIDE_SECONDS),
    showcaseSlides,
    showcaseTitle: settings.showcaseTitle || DEFAULT_SHOWCASE_TITLE,
    showcaseSubtitle: settings.showcaseSubtitle || DEFAULT_SHOWCASE_SUBTITLE,
  };
}

export async function getPublicShowcaseSettings() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const settings = await getAutoStatusConfig(db);
  return {
    showcaseSlideSeconds: Number(settings.showcaseSlideSeconds ?? DEFAULT_SHOWCASE_SLIDE_SECONDS),
    showcaseSlides: parseShowcaseSlidesJson(settings.showcaseSlidesJson),
    showcaseTitle: settings.showcaseTitle || DEFAULT_SHOWCASE_TITLE,
    showcaseSubtitle: settings.showcaseSubtitle || DEFAULT_SHOWCASE_SUBTITLE,
  };
}

export async function updateAppSettings(input: {
  autoPreparingPercent?: number;
  autoDeliveredGraceMinutes?: number;
  showcaseSlideSeconds?: number;
  showcaseTitle?: string;
  showcaseSubtitle?: string;
  showcaseSlides?: Array<{
    id?: string;
    title?: string;
    imageUrl?: string;
    durationSeconds?: number;
    isActive?: boolean;
  }>;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getAutoStatusConfig(db);
  const autoPreparingPercent = Math.min(
    80,
    Math.max(0, Number(input.autoPreparingPercent ?? existing.autoPreparingPercent))
  );
  const autoDeliveredGraceMinutes = Math.min(
    120,
    Math.max(0, Number(input.autoDeliveredGraceMinutes ?? existing.autoDeliveredGraceMinutes))
  );
  const showcaseSlideSeconds = Math.min(
    30,
    Math.max(3, Number(input.showcaseSlideSeconds ?? existing.showcaseSlideSeconds ?? DEFAULT_SHOWCASE_SLIDE_SECONDS))
  );
  const showcaseSlides =
    input.showcaseSlides !== undefined
      ? normalizeShowcaseSlides(input.showcaseSlides)
      : parseShowcaseSlidesJson(existing.showcaseSlidesJson);
  const showcaseTitle = (input.showcaseTitle ?? existing.showcaseTitle ?? DEFAULT_SHOWCASE_TITLE)
    .toString()
    .trim()
    .slice(0, 160);
  const showcaseSubtitle = (input.showcaseSubtitle ?? existing.showcaseSubtitle ?? DEFAULT_SHOWCASE_SUBTITLE)
    .toString()
    .trim()
    .slice(0, 160);

  await db
    .update(appSettings)
    .set({
      autoPreparingPercent,
      autoDeliveredGraceMinutes,
      showcaseSlideSeconds,
      showcaseTitle,
      showcaseSubtitle,
      showcaseSlidesJson: JSON.stringify(showcaseSlides),
      updatedAt: new Date(),
    })
    .where(eq(appSettings.id, Number(existing.id)));

  const [updated] = await db.select().from(appSettings).where(eq(appSettings.id, Number(existing.id))).limit(1);
  const finalSettings = updated ?? existing;
  return {
    ...finalSettings,
    showcaseSlideSeconds: Number(finalSettings.showcaseSlideSeconds ?? DEFAULT_SHOWCASE_SLIDE_SECONDS),
    showcaseSlides: parseShowcaseSlidesJson(finalSettings.showcaseSlidesJson),
    showcaseTitle: finalSettings.showcaseTitle || DEFAULT_SHOWCASE_TITLE,
    showcaseSubtitle: finalSettings.showcaseSubtitle || DEFAULT_SHOWCASE_SUBTITLE,
  };
}

export async function updateOrderStatus(id: number, status: InsertOrder["status"]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(orders)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, id));

  const [updated] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  return updated;
}

export async function updateOrderStatusWithMeta(
  id: number,
  status: InsertOrder["status"],
  estimatedReadyMinutes?: number | null
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(orders)
    .set({
      status,
      estimatedReadyMinutes:
        estimatedReadyMinutes === undefined ? undefined : estimatedReadyMinutes ?? null,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, id));

  const [updated] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  return updated;
}

export async function updateOrderDetails(id: number, data: UpdateOrderDetailsPayload) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.transaction(async (tx) => {
    const [existingOrder] = await tx.select().from(orders).where(eq(orders.id, id)).limit(1);

    if (!existingOrder) {
      throw new Error("Pedido nao encontrado");
    }

    if (existingOrder.status === "delivered" || existingOrder.status === "cancelled") {
      throw new Error("Pedido finalizado nao pode ser alterado");
    }

    const requestedProductIds = Array.from(
      new Set(
        data.items
          .map((item) => item.productId ?? null)
          .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
      )
    );

    const validProductIds = new Set<number>();

    if (requestedProductIds.length > 0) {
      const existingProducts = await tx
        .select({ id: products.id })
        .from(products)
        .where(inArray(products.id, requestedProductIds));

      existingProducts.forEach((product) => {
        validProductIds.add(Number(product.id));
      });
    }

    await tx
      .update(orders)
      .set({
        customerName: data.customerName.trim(),
        customerPhone: data.customerPhone ? normalizePhone(data.customerPhone) : null,
        notes: data.notes ?? null,
        total: data.total,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, id));

    await tx.delete(orderItems).where(eq(orderItems.orderId, id));

    if (data.items.length > 0) {
      const rows: InsertOrderItem[] = data.items.map((item) => ({
        orderId: id,
        productId:
          item.productId && validProductIds.has(Number(item.productId)) ? item.productId : null,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        imageUrl: item.imageUrl ?? null,
        customization: item.customization ?? null,
        observations: item.observations ?? null,
      }));

      await tx.insert(orderItems).values(rows);
    }

    const [updatedOrder] = await tx.select().from(orders).where(eq(orders.id, id)).limit(1);

    if (!updatedOrder) {
      return updatedOrder;
    }

    const updatedItems = await tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, id))
      .orderBy(asc(orderItems.id));

    const table =
      updatedOrder.tableId !== null && updatedOrder.tableId !== undefined
        ? (
            await tx
              .select()
              .from(diningTables)
              .where(eq(diningTables.id, Number(updatedOrder.tableId)))
              .limit(1)
          )[0] ?? null
        : null;

    return {
      ...updatedOrder,
      tableNumber: table?.number ?? null,
      tableLabel: table?.label ?? null,
      items: updatedItems,
    };
  });
}

export async function getOrderByTrackingCode(trackingCode: string) {
  const db = await getDb();
  if (!db) return undefined;
  await syncTimedOrderStatuses(db);

  const baseOrders = await db
    .select()
    .from(orders)
    .where(eq(orders.trackingCode, trackingCode))
    .limit(1);

  if (baseOrders.length === 0) return undefined;

  const hydrated = await hydrateOrders(baseOrders);
  return hydrated[0];
}

export async function getLatestOrderByPhone(customerPhone: string) {
  const db = await getDb();
  if (!db) return undefined;
  await syncTimedOrderStatuses(db);

  const normalizedPhone = normalizePhone(customerPhone);

  const baseOrders = await db
    .select()
    .from(orders)
    .where(eq(orders.customerPhone, normalizedPhone));

  if (baseOrders.length === 0) return undefined;

  const hydrated = await hydrateOrders(baseOrders);
  const sorted = hydrated.sort((a, b) => {
    const aActive = a.status !== "delivered" && a.status !== "cancelled";
    const bActive = b.status !== "delivered" && b.status !== "cancelled";
    const aHasItems = a.items.length > 0;
    const bHasItems = b.items.length > 0;

    if (aActive !== bActive) return aActive ? -1 : 1;
    if (aHasItems !== bHasItems) return aHasItems ? -1 : 1;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return sorted[0];
}

export async function hardDeleteAllImportedData() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(products);
  await db.delete(categories);
}
