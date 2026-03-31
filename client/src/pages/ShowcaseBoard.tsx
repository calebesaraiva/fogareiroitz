import { trpc } from "@/lib/trpc";
import { useEffect, useMemo, useState } from "react";

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
  const [featuredIndex, setFeaturedIndex] = useState(0);

  useEffect(() => {
    if (products.length <= 1) return;
    const timer = window.setInterval(() => {
      setFeaturedIndex((prev) => (prev + 1) % products.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [products]);

  useEffect(() => {
    if (featuredIndex >= products.length) {
      setFeaturedIndex(0);
    }
  }, [featuredIndex, products.length]);

  const featuredProduct = products[featuredIndex] ?? null;
  const animatedOrders = orders.length > 0 ? [...orders, ...orders] : [];
  const marqueeProducts = products.length > 0 ? [...products, ...products] : [];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#3d1a22_0%,#150b0f_52%,#0f070a_100%)] text-white">
      <style>{`
        @keyframes boardFadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes cardPulse {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
        }
        @keyframes marqueeLeft {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @keyframes productRail {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @keyframes imageZoom {
          from { transform: scale(1); }
          to { transform: scale(1.08); }
        }
        @keyframes fadeSwap {
          from { opacity: 0.25; }
          to { opacity: 1; }
        }
      `}</style>

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
        {featuredProduct ? (
          <section className="mb-6 overflow-hidden rounded-3xl border border-white/10 bg-black/35 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
            <div className="relative h-[50vh] min-h-[320px]">
              <img
                key={featuredProduct.id}
                src={featuredProduct.imageUrl || FALLBACK_IMAGE}
                alt={featuredProduct.name}
                className={`absolute inset-0 h-full w-full ${featuredProduct.imageFit === "contain" ? "object-contain bg-black/50 p-6" : "object-cover"} animate-[fadeSwap_600ms_ease-out,imageZoom_4500ms_linear]`}
              />
              <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/35 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
              <div className="absolute bottom-0 left-0 p-6">
                <p className="text-xs uppercase tracking-[0.35em] text-amber-300/90">Destaque da casa</p>
                <h2 className="text-3xl font-bold md:text-6xl">{featuredProduct.name}</h2>
              </div>
              <div className="absolute bottom-5 right-6 flex items-center gap-2">
                {products.slice(0, 8).map((product, index) => (
                  <div
                    key={product.id}
                    className={`h-2.5 rounded-full transition-all duration-500 ${
                      index === featuredIndex ? "w-10 bg-amber-300" : "w-2.5 bg-white/40"
                    }`}
                  />
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/20 p-3">
          <div className="flex min-w-max gap-4 animate-[productRail_45s_linear_infinite]">
            {marqueeProducts.map((product, index) => (
              <article
                key={`${product.id}-${index}`}
                className="group w-[260px] shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-[0_16px_40px_rgba(0,0,0,0.3)]"
              >
                <div className="relative h-40 overflow-hidden bg-black/25">
                  <img
                    src={product.imageUrl || FALLBACK_IMAGE}
                    alt={product.name}
                    className={`h-full w-full ${product.imageFit === "contain" ? "object-contain bg-black/20 p-2" : "object-cover"} transition-transform duration-700 group-hover:scale-110`}
                  />
                  <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 to-transparent" />
                </div>
                <div className="p-3">
                  <h2 className="line-clamp-2 text-base font-semibold">{product.name}</h2>
                </div>
              </article>
            ))}
          </div>
        </div>
      </main>

      <footer className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-black/55 backdrop-blur">
        <div className="mx-auto max-w-[1600px] overflow-hidden px-6 py-3">
          {orders.length === 0 ? (
            <div className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/80">
              Nenhum pedido recente agora.
            </div>
          ) : (
            <div className="flex min-w-max gap-3 whitespace-nowrap animate-[marqueeLeft_30s_linear_infinite]">
              {animatedOrders.map((order, idx) => (
                <div
                  key={`${order.id}-${idx}`}
                  className="shrink-0 rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-sm"
                >
                  Pedido #{order.id} - {order.customerName}
                  {order.tableNumber ? ` - Mesa ${order.tableNumber}` : ""} - {STATUS_LABEL[order.status]}
                </div>
              ))}
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
