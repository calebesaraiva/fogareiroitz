import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const userRoleEnum = pgEnum("user_role", ["user", "admin", "kitchen", "waiter", "cashier"]);
export const orderTypeEnum = pgEnum("order_type", [
  "dine_in",
  "takeaway",
  "reservation",
]);
export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "new",
  "preparing",
  "ready",
  "delivered",
  "cancelled",
]);

export const users = pgTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: serial("id").primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  passwordHash: varchar("passwordHash", { length: 255 }),
  role: userRoleEnum("role").default("user").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn", { mode: "date" }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull().unique(),
  slug: varchar("slug", { length: 140 }).notNull().unique(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
});

export type Category = typeof categories.$inferSelect;
export type InsertCategory = typeof categories.$inferInsert;

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  categoryId: integer("categoryId").references(() => categories.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  price: integer("price").notNull(), // Store in cents to avoid floating point issues
  imageUrl: text("imageUrl"),
  imageFit: varchar("imageFit", { length: 24 }).default("cover").notNull(),
  imageKey: varchar("imageKey", { length: 255 }), // S3 key for deletion
  ingredients: text("ingredients"), // JSON string of available ingredients
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
});

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

export const diningTables = pgTable("dining_tables", {
  id: serial("id").primaryKey(),
  number: integer("number").notNull().unique(),
  label: varchar("label", { length: 80 }),
  publicToken: varchar("publicToken", { length: 48 }).notNull().unique(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
});

export type DiningTable = typeof diningTables.$inferSelect;
export type InsertDiningTable = typeof diningTables.$inferInsert;

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  trackingCode: varchar("trackingCode", { length: 24 }).notNull().unique(),
  customerName: varchar("customerName", { length: 160 }).notNull(),
  customerPhone: varchar("customerPhone", { length: 40 }),
  orderType: orderTypeEnum("orderType").notNull(),
  status: orderStatusEnum("status").default("new").notNull(),
  tableId: integer("tableId").references(() => diningTables.id),
  estimatedReadyMinutes: integer("estimatedReadyMinutes"),
  notes: text("notes"),
  guestCount: integer("guestCount"),
  reservationAt: timestamp("reservationAt", { mode: "date" }),
  total: integer("total").notNull(),
  isPaid: boolean("isPaid").default(false).notNull(),
  paidAt: timestamp("paidAt", { mode: "date" }),
  serviceFeeApplied: boolean("serviceFeeApplied").default(true).notNull(),
  serviceFeeAmount: integer("serviceFeeAmount").default(0).notNull(),
  paidTotal: integer("paidTotal"),
  paymentMethod: varchar("paymentMethod", { length: 24 }),
  amountReceived: integer("amountReceived"),
  changeDue: integer("changeDue"),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
});

export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("orderId")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productId: integer("productId").references(() => products.id),
  productName: varchar("productName", { length: 255 }).notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: integer("unitPrice").notNull(),
  totalPrice: integer("totalPrice").notNull(),
  imageUrl: text("imageUrl"),
  customization: varchar("customization", { length: 80 }),
  observations: text("observations"),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
});

export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = typeof orderItems.$inferInsert;

export const appSettings = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  autoPreparingPercent: integer("autoPreparingPercent").default(15).notNull(),
  autoDeliveredGraceMinutes: integer("autoDeliveredGraceMinutes").default(8).notNull(),
  showcaseSlidesJson: text("showcaseSlidesJson"),
  showcaseSlideSeconds: integer("showcaseSlideSeconds").default(6).notNull(),
  showcaseTitle: varchar("showcaseTitle", { length: 160 }),
  showcaseSubtitle: varchar("showcaseSubtitle", { length: 160 }),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull(),
});

export type AppSettings = typeof appSettings.$inferSelect;
export type InsertAppSettings = typeof appSettings.$inferInsert;
