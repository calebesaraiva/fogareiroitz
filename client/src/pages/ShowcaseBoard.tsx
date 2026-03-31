import { trpc } from "@/lib/trpc";
import { useMemo } from "react";

type ShowcaseOrder = {
  id: number;
  customerName: string;
  tableNumber: number | null;
  status: "pending" | "new" | "preparing" | "ready" | "delivered" | "cancelled";
  createdAt: Date;
};

type CatalogProduct = {
  id: number;
  name: string;
  imageUrl: string | null;
  imageFit?: "cover" | "contain";
  price: number;
};

const STATUS_LABEL: Record<ShowcaseOrder["status"], string> = {
  pending: "Aguardando aprovacao",
  new: "Aceito",
  preparing: "Em preparo",
  ready: "Pronto",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

const FALLBACK_IMAGE =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'><rect width='100%25' height='100%25' fill='%231e1116'/><text x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23ffcfb7' font-family='Arial' font-size='42'>Fogareiro</text></svg>";

export default function ShowcaseBoard() {
  const restaurantName = import.meta.env.VITE_APP_TITLE || "Fogareiro ITZ Restaurante";
  const restaurantLogo = import.meta.env.VITE_APP_LOGO || "/fogareiro-logo.png";

  const productsQuery = trpc.products.list.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const boardOrdersQuery = trpc.orders.liveBoard.useQuery(undefined, {
    refetchInterval: 5000,
  });

  const products = useMemo(() => (productsQuery.data ?? []) as CatalogProduct[], [productsQuery.data]);
  const orders = useMemo(() => (boardOrdersQuery.data ?? []) as ShowcaseOrder[], [boardOrdersQuery.data]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#3d1a22_0%,#150b0f_52%,#0f070a_100%)] text-white">
      <header className="border-b border-white/10 bg-black/25 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-5">
          <div className="flex items-center gap-4">
            <img
              src={restaurantLogo}
              alt={restaurantName}
              className="h-16 w-16 rounded-full border border-white/15 bg-white/5 p-2 object-contain"
            />
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-amber-300/90">Cardapio da casa</p>
              <h1 className="text-3xl font-bold">{restaurantName}</h1>
            </div>
          </div>
          <p className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-4 py-2 text-sm">
            Painel ao vivo
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-6 py-6 pb-24">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {products.map((product) => (
            <article
              key={product.id}
              className="group overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_24px_60px_rgba(0,0,0,0.25)]"
            >
              <div className="relative h-56 overflow-hidden bg-black/25">
                <img
                  src={product.imageUrl || FALLBACK_IMAGE}
                  alt={product.name}
                  className={`h-full w-full ${product.imageFit === "contain" ? "object-contain bg-black/20 p-3" : "object-cover"} transition-transform duration-500 group-hover:scale-105`}
                />
                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />
              </div>
              <div className="p-4">
                <h2 className="line-clamp-2 text-lg font-semibold">{product.name}</h2>
              </div>
            </article>
          ))}
        </div>
      </main>

      <footer className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-black/55 backdrop-blur">
        <div className="no-scrollbar mx-auto flex max-w-[1600px] gap-3 overflow-x-auto px-6 py-3">
          {orders.length === 0 ? (
            <div className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/80">
              Nenhum pedido recente agora.
            </div>
          ) : (
            orders.map((order) => (
              <div
                key={order.id}
                className="shrink-0 rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-sm"
              >
                Pedido #{order.id} - {order.customerName}
                {order.tableNumber ? ` - Mesa ${order.tableNumber}` : ""} - {STATUS_LABEL[order.status]}
              </div>
            ))
          )}
        </div>
      </footer>
    </div>
  );
}
