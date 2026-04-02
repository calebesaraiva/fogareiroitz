import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

type MockTable = {
  id: number;
  number: number;
  label: string | null;
  publicToken: string;
  isActive: boolean;
};

type MockOrder = {
  id: number;
  trackingCode: string;
  customerName: string;
  customerPhone: string | null;
  orderType: "dine_in";
  status: "pending" | "new" | "preparing" | "ready" | "delivered" | "cancelled";
  tableId: number | null;
  notes: string | null;
  total: number;
};

const ACTIVE_STATUSES = new Set(["pending", "new", "preparing", "ready"]);

let mockTables: MockTable[] = [];
let mockOrders: MockOrder[] = [];
let nextOrderId = 1;

vi.mock("./db", () => {
  const getOccupiedTableIds = () =>
    new Set(
      mockOrders
        .filter((order) => order.tableId !== null && ACTIVE_STATUSES.has(order.status))
        .map((order) => Number(order.tableId))
    );

  return {
    authenticateLocalUser: vi.fn(),
    closeCashierDay: vi.fn(),
    createDiningTable: vi.fn(async ({ number, label }: { number: number; label?: string }) => {
      const table = {
        id: mockTables.length + 1,
        number,
        label: label ?? `Mesa ${number}`,
        publicToken: `mesa_mock_${number}`,
        isActive: true,
      };
      mockTables.push(table);
      return table;
    }),
    createLocalUser: vi.fn(),
    createProduct: vi.fn(),
    createOrder: vi.fn(async (data: {
      customerName: string;
      customerPhone?: string | null;
      orderType: "dine_in";
      status?: MockOrder["status"];
      tableId?: number | null;
      notes?: string | null;
      total: number;
    }) => {
      const order: MockOrder = {
        id: nextOrderId++,
        trackingCode: `FGR-TEST-${nextOrderId}`,
        customerName: data.customerName,
        customerPhone: data.customerPhone ?? null,
        orderType: data.orderType,
        status: data.status ?? "pending",
        tableId: data.tableId ?? null,
        notes: data.notes ?? null,
        total: data.total,
      };
      mockOrders.push(order);
      return order;
    }),
    deleteProduct: vi.fn(),
    getAllCategories: vi.fn(async () => []),
    getAllDiningTables: vi.fn(async () => mockTables),
    getAllOrders: vi.fn(async () => []),
    getAllProducts: vi.fn(async () => []),
    getAppSettings: vi.fn(async () => null),
    getPublicShowcaseSettings: vi.fn(async () => null),
    getActiveDiningTables: vi.fn(async () => {
      const occupiedTableIds = getOccupiedTableIds();
      return mockTables.filter((table) => table.isActive && !occupiedTableIds.has(Number(table.id)));
    }),
    getCashierOrders: vi.fn(async () => []),
    getCashierReport: vi.fn(),
    getDiningTableByPublicToken: vi.fn(async (token: string, options?: { requireAvailable?: boolean }) => {
      const table = mockTables.find((entry) => entry.publicToken === token && entry.isActive);
      if (!table) return undefined;
      if (!options?.requireAvailable) return table;
      const occupiedTableIds = getOccupiedTableIds();
      return occupiedTableIds.has(Number(table.id)) ? undefined : table;
    }),
    getLatestOrderByPhone: vi.fn(async (phone: string) => {
      return [...mockOrders].reverse().find((order) => order.customerPhone === phone) ?? null;
    }),
    getProductById: vi.fn(),
    getKitchenOrders: vi.fn(async () => []),
    listLocalUsers: vi.fn(async () => []),
    markOrderAsPaid: vi.fn(),
    updateAppSettings: vi.fn(),
    updateLocalUser: vi.fn(),
    updateLocalUserPassword: vi.fn(),
    updateOrderDetails: vi.fn(),
    updateOrderStatus: vi.fn(async (id: number, status: MockOrder["status"]) => {
      const order = mockOrders.find((entry) => entry.id === id);
      if (!order) throw new Error("Pedido nao encontrado");
      order.status = status;
      return order;
    }),
    updateOrderStatusWithMeta: vi.fn(async (id: number, status: MockOrder["status"]) => {
      const order = mockOrders.find((entry) => entry.id === id);
      if (!order) throw new Error("Pedido nao encontrado");
      order.status = status;
      return order;
    }),
    updateProduct: vi.fn(),
  };
});

const { appRouter } = await import("./routers");

function createContext(role: TrpcContext["user"] extends infer U ? NonNullable<U>["role"] | null : null) {
  return {
    req: {
      protocol: "http",
      headers: {},
      get: () => "localhost:3000",
    } as TrpcContext["req"],
    res: {
      cookie: () => undefined,
      clearCookie: () => undefined,
    } as TrpcContext["res"],
    user: role
      ? {
          id: 1,
          openId: `test-${role}`,
          email: `${role}@local.test`,
          name: `Test ${role}`,
          loginMethod: "local",
          passwordHash: null,
          role,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        }
      : null,
  } satisfies TrpcContext;
}

describe("table access ordering flow", () => {
  beforeEach(() => {
    mockTables = [
      {
        id: 1,
        number: 10,
        label: "Mesa 10",
        publicToken: "mesa_mock_10",
        isActive: true,
      },
    ];
    mockOrders = [];
    nextOrderId = 1;
  });

  it("allows one dine-in order, blocks the occupied table, and reopens it after delivery", async () => {
    const publicCaller = appRouter.createCaller(createContext(null));
    const waiterCaller = appRouter.createCaller(createContext("waiter"));
    const kitchenCaller = appRouter.createCaller(createContext("kitchen"));

    await expect(publicCaller.tables.list()).rejects.toThrow();

    const availableTables = await waiterCaller.tables.list();
    expect(availableTables).toHaveLength(1);
    expect(availableTables[0]?.id).toBe(1);

    const access = await publicCaller.tables.resolvePublicAccess({ token: "mesa_mock_10" });
    expect(access.id).toBe(1);
    expect(access.accessToken).toContain("mesa_mock_10");
    expect(access.expiresAt).toBeGreaterThan(Date.now());

    const order = await publicCaller.orders.create({
      customerName: "Cliente Teste",
      customerPhone: "5599999999999",
      orderType: "dine_in",
      tableId: 1,
      tableToken: access.accessToken,
      total: 2500,
      items: [
        {
          productName: "Prato teste",
          quantity: 1,
          unitPrice: 2500,
          totalPrice: 2500,
        },
      ],
    });

    expect(order.id).toBeGreaterThan(0);
    expect(order.tableId).toBe(1);

    await expect(publicCaller.tables.resolvePublicAccess({ token: "mesa_mock_10" })).rejects.toThrow(
      "Mesa nao autorizada para pedido presencial"
    );
    await expect(
      publicCaller.tables.resolveAccessSession({ accessToken: access.accessToken })
    ).rejects.toThrow("Mesa nao autorizada para pedido presencial");
    await expect(
      publicCaller.orders.create({
        customerName: "Cliente Teste 2",
        customerPhone: "5599888888888",
        orderType: "dine_in",
        tableId: 1,
        tableToken: access.accessToken,
        total: 1800,
        items: [
          {
            productName: "Prato teste 2",
            quantity: 1,
            unitPrice: 1800,
            totalPrice: 1800,
          },
        ],
      })
    ).rejects.toThrow("Pedido presencial permitido apenas por mesa autorizada");

    const trackedOrder = await publicCaller.orders.track({ customerPhone: "5599999999999" });
    expect(trackedOrder?.id).toBe(order.id);

    await kitchenCaller.orders.updateStatus({ id: order.id, status: "delivered" });

    const reopenedAccess = await publicCaller.tables.resolvePublicAccess({ token: "mesa_mock_10" });
    expect(reopenedAccess.id).toBe(1);
  });
});
