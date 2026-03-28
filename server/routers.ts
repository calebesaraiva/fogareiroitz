import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import {
  authenticateLocalUser,
  createDiningTable,
  createLocalUser,
  createProduct,
  createOrder,
  deleteProduct,
  getAllCategories,
  getAllDiningTables,
  getAllOrders,
  getAllProducts,
  getActiveDiningTables,
  getDiningTableByPublicToken,
  getLatestOrderByPhone,
  getProductById,
  getKitchenOrders,
  listLocalUsers,
  updateLocalUser,
  updateLocalUserPassword,
  updateOrderDetails,
  updateOrderStatus,
  updateOrderStatusWithMeta,
  updateProduct,
} from "./db";

const canViewOrders = (role?: string | null) =>
  role === "admin" || role === "kitchen" || role === "waiter";

const canOperateOrders = (role?: string | null) =>
  role === "kitchen" || role === "waiter";

const phoneSchema = z
  .string()
  .transform((value) => value.replace(/\D/g, ""))
  .refine((value) => value.length >= 10 && value.length <= 15, {
    message: "Telefone invalido",
  });

const staffRoleSchema = z.enum(["admin", "kitchen", "waiter"]);

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    login: publicProcedure
      .input(
        z.object({
          email: z.string().email(),
          password: z.string().min(6),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const user = await authenticateLocalUser(input.email, input.password);

        if (!user) {
          throw new Error("Email ou senha invalidos");
        }

        const cookieOptions = getSessionCookieOptions(ctx.req);
        const sessionToken = await sdk.signSession({
          openId: user.openId,
          appId: process.env.VITE_APP_ID || "local-app",
          name: user.name || user.email || "Usuario local",
        });

        ctx.res.cookie(COOKIE_NAME, sessionToken, {
          ...cookieOptions,
          maxAge: 1000 * 60 * 60 * 24 * 30,
        });

        return user;
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  staff: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user?.role !== "admin") throw new Error("Unauthorized");
      return listLocalUsers();
    }),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(2),
          email: z.string().email(),
          password: z.string().min(6),
          role: staffRoleSchema,
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.role !== "admin") throw new Error("Unauthorized");
        return createLocalUser(input);
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          name: z.string().min(2).optional(),
          role: staffRoleSchema.optional(),
          isActive: z.boolean().optional(),
          password: z.string().min(6).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.role !== "admin") throw new Error("Unauthorized");

        const { id, password, ...data } = input;
        const updated = await updateLocalUser(id, data);

        if (password) {
          await updateLocalUserPassword(id, password);
        }

        return updated;
      }),
  }),

  categories: router({
    list: publicProcedure.query(async () => {
      return getAllCategories();
    }),
  }),

  tables: router({
    list: publicProcedure.query(async () => {
      return getActiveDiningTables();
    }),

    resolvePublicAccess: publicProcedure
      .input(
        z.object({
          token: z.string().min(12),
        })
      )
      .query(async ({ input }) => {
        const table = await getDiningTableByPublicToken(input.token);
        if (!table) {
          throw new Error("Mesa nao autorizada para pedido presencial");
        }

        return {
          id: table.id,
          number: table.number,
          label: table.label,
          publicToken: table.publicToken,
        };
      }),

    listAll: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user?.role !== "admin") throw new Error("Unauthorized");
      return getAllDiningTables();
    }),

    create: protectedProcedure
      .input(
        z.object({
          number: z.number().int().positive(),
          label: z.string().max(80).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.role !== "admin") throw new Error("Unauthorized");
        return createDiningTable(input);
      }),
  }),

  products: router({
    list: publicProcedure.query(async () => {
      return getAllProducts();
    }),

    listAll: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user?.role !== "admin") throw new Error("Unauthorized");
      return getAllProducts(true);
    }),

    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return getProductById(input.id);
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        categoryName: z.string().min(1).optional(),
        description: z.string().optional(),
        price: z.number().int().positive(),
        imageUrl: z.string().optional(),
        imageKey: z.string().optional(),
        ingredients: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.role !== "admin") throw new Error("Unauthorized");
        return createProduct(input);
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        categoryName: z.string().min(1).optional(),
        description: z.string().optional(),
        price: z.number().int().positive().optional(),
        imageUrl: z.string().optional(),
        imageKey: z.string().optional(),
        ingredients: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.role !== "admin") throw new Error("Unauthorized");
        const { id, ...data } = input;
        return updateProduct(id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.role !== "admin") throw new Error("Unauthorized");
        return deleteProduct(input.id);
      }),
  }),

  orders: router({
    create: publicProcedure
      .input(
        z.object({
          customerName: z.string().min(2),
          customerPhone: phoneSchema,
          orderType: z.literal("dine_in"),
          tableId: z.number().int().positive(),
          tableToken: z.string().min(12),
          notes: z.string().optional(),
          total: z.number().int().positive(),
          items: z.array(
            z.object({
              productId: z.number().int().positive().optional(),
              productName: z.string().min(1),
              quantity: z.number().int().positive(),
              unitPrice: z.number().int().positive(),
              totalPrice: z.number().int().positive(),
              imageUrl: z.string().optional(),
              customization: z.string().optional(),
              observations: z.string().optional(),
            })
          ).min(1),
        })
      )
      .mutation(async ({ input }) => {
        const authorizedTable = await getDiningTableByPublicToken(input.tableToken);
        if (!authorizedTable || Number(authorizedTable.id) !== Number(input.tableId)) {
          throw new Error("Pedido presencial permitido apenas por mesa autorizada");
        }

        return createOrder({
          ...input,
          status: "pending",
          customerPhone: input.customerPhone?.trim() || null,
          notes: input.notes?.trim() || null,
          reservationAt: null,
          guestCount: null,
        });
      }),

    createInternal: protectedProcedure
      .input(
        z.object({
          customerName: z.string().min(2),
          customerPhone: phoneSchema,
          tableId: z.number().int().positive(),
          notes: z.string().optional(),
          total: z.number().int().positive(),
          items: z.array(
            z.object({
              productId: z.number().int().positive().optional(),
              productName: z.string().min(1),
              quantity: z.number().int().positive(),
              unitPrice: z.number().int().positive(),
              totalPrice: z.number().int().positive(),
              imageUrl: z.string().optional(),
              customization: z.string().optional(),
              observations: z.string().optional(),
            })
          ).min(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.role !== "waiter") {
          throw new Error("Unauthorized");
        }
        return createOrder({
          ...input,
          orderType: "dine_in",
          status: "new",
          customerPhone: input.customerPhone?.trim() || null,
          notes: input.notes?.trim() || null,
          reservationAt: null,
          guestCount: null,
        });
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      if (!canViewOrders(ctx.user?.role)) throw new Error("Unauthorized");
      return getAllOrders();
    }),

    kitchen: protectedProcedure.query(async ({ ctx }) => {
      if (!canOperateOrders(ctx.user?.role)) throw new Error("Unauthorized");
      return getKitchenOrders();
    }),

    track: publicProcedure
      .input(
        z.object({
          customerPhone: phoneSchema,
        })
      )
      .query(async ({ input }) => {
        return getLatestOrderByPhone(input.customerPhone.trim());
      }),

    updateStatus: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          status: z.enum(["pending", "new", "preparing", "ready", "delivered", "cancelled"]),
          estimatedReadyMinutes: z.number().int().positive().max(240).nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!canOperateOrders(ctx.user?.role)) throw new Error("Unauthorized");
        if (input.estimatedReadyMinutes !== undefined) {
          return updateOrderStatusWithMeta(
            input.id,
            input.status,
            input.estimatedReadyMinutes
          );
        }
        return updateOrderStatus(input.id, input.status);
      }),

    updateDetails: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          customerName: z.string().min(2),
          customerPhone: phoneSchema,
          notes: z.string().optional(),
          total: z.number().int().positive(),
          items: z.array(
            z.object({
              productId: z.number().int().positive().nullable().optional(),
              productName: z.string().min(1),
              quantity: z.number().int().positive(),
              unitPrice: z.number().int().positive(),
              totalPrice: z.number().int().positive(),
              imageUrl: z.string().nullable().optional(),
              customization: z.string().nullable().optional(),
              observations: z.string().nullable().optional(),
            })
          ).min(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!canOperateOrders(ctx.user?.role)) throw new Error("Unauthorized");
        const { id, ...data } = input;
        return updateOrderDetails(id, {
          ...data,
          customerPhone: input.customerPhone?.trim() || null,
          notes: input.notes?.trim() || null,
          items: input.items.map((item) => ({
            ...item,
            productId: item.productId ?? null,
            imageUrl: item.imageUrl ?? null,
            customization: item.customization ?? null,
            observations: item.observations ?? null,
          })),
        });
      }),
  }),
});

export type AppRouter = typeof appRouter;
