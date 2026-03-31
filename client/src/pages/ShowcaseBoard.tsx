import { trpc } from "@/lib/trpc";
import { useEffect, useMemo, useState } from "react";

type ShowcaseOrder = {
  id: number;
  customerName: string;
  tableNumber: number | null;
  status: "pending" | "new" | "preparing" | "ready" | "delivered" | "cancelled";
  createdAt: Date;
};

type ShowcaseSlide = {
  id: string;
  title: string;
  imageUrl: string;
  durationSeconds: number;
  isActive: boolean;
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
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'><rect width='100%25' height='100%25' fill='%2315111a'/><text x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23f6d4aa' font-family='Arial' font-size='42'>Fogareiro</text></svg>";

export default function ShowcaseBoard() {
  const fallbackRestaurantName = import.meta.env.VITE_APP_TITLE || "Fogareiro ITZ Restaurante";
  const restaurantLogo = import.meta.env.VITE_APP_LOGO || "/fogareiro-logo.png";
  const isPreviewMode =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "1";

  const showcaseSettingsQuery = trpc.settings.showcasePublic.useQuery(undefined, {
    refetchInterval: 30000,
    enabled: !isPreviewMode,
  });
  const boardOrdersQuery = trpc.orders.liveBoard.useQuery(undefined, {
    refetchInterval: 5000,
  });

  const previewSettings = useMemo(() => {
    if (!isPreviewMode || typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem("fogareiro_showcase_preview");
      if (!raw) return null;
      return JSON.parse(raw) as {
        showcaseTitle?: string;
        showcaseSubtitle?: string;
        showcaseSlideSeconds?: number;
        showcaseSlides?: ShowcaseSlide[];
      };
    } catch {
      return null;
    }
  }, [isPreviewMode]);

  const showcaseSlides = useMemo(() => {
    const source = isPreviewMode ? previewSettings?.showcaseSlides : showcaseSettingsQuery.data?.showcaseSlides;
    return ((source ?? []) as ShowcaseSlide[]).filter((slide) => slide.isActive !== false);
  }, [isPreviewMode, previewSettings, showcaseSettingsQuery.data]);
  const orders = useMemo(() => (boardOrdersQuery.data ?? []) as ShowcaseOrder[], [boardOrdersQuery.data]);
  const [slideIndex, setSlideIndex] = useState(0);
  const slides = showcaseSlides.map((slide) => ({
    id: slide.id,
    name: slide.title || "Destaque",
    imageUrl: slide.imageUrl,
    durationSeconds:
      slide.durationSeconds ||
      Number(
        isPreviewMode
          ? previewSettings?.showcaseSlideSeconds ?? 6
          : showcaseSettingsQuery.data?.showcaseSlideSeconds ?? 6
      ),
  }));

  useEffect(() => {
    if (slides.length <= 1) return;
    const current = slides[slideIndex] ?? slides[0];
    const waitMs = Math.max(3, Number(current?.durationSeconds ?? 6)) * 1000;
    const timer = window.setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % slides.length);
    }, waitMs);
    return () => window.clearInterval(timer);
  }, [slides, slideIndex]);

  useEffect(() => {
    if (slideIndex >= slides.length) setSlideIndex(0);
  }, [slideIndex, slides.length]);

  const active = slides[slideIndex] ?? null;
  const tickerOrders = orders.length > 0 ? [...orders, ...orders] : [];
  const thumbProducts = slides.length > 0 ? [...slides, ...slides] : [];
  const headerTitle = isPreviewMode
    ? previewSettings?.showcaseTitle || fallbackRestaurantName
    : showcaseSettingsQuery.data?.showcaseTitle || fallbackRestaurantName;
  const headerSubtitle = isPreviewMode
    ? previewSettings?.showcaseSubtitle || "Cardapio da casa"
    : showcaseSettingsQuery.data?.showcaseSubtitle || "Cardapio da casa";

  return (
    <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#3b1820_0%,#1a0c12_58%,#10070b_100%)] text-white">
      <style>{`
        @keyframes fadeIn {
          from { opacity: .3; transform: scale(1.03); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes zoomSlow {
          from { transform: scale(1); }
          to { transform: scale(1.05); }
        }
        @keyframes marqueeLeft {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>

      <header className="border-b border-white/10 bg-black/25 backdrop-blur">
        <div className="mx-auto flex max-w-[1680px] items-center justify-between px-6 py-5">
          <div className="flex items-center gap-4">
            <img
              src={restaurantLogo}
              alt={headerTitle}
              className="h-16 w-16 rounded-full border border-white/20 bg-black/30 p-2 object-contain"
            />
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-amber-300/90">{headerSubtitle}</p>
              <h1 className="text-3xl font-bold">{headerTitle}</h1>
            </div>
          </div>
          <div className="rounded-full border border-emerald-300/35 bg-emerald-300/10 px-4 py-2 text-sm">
            Painel ao vivo
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1680px] px-6 py-6 pb-24">
        {active ? (
          <section className="relative mb-5 h-[58vh] min-h-[380px] overflow-hidden rounded-3xl border border-white/10 bg-black/40 shadow-[0_30px_90px_rgba(0,0,0,0.35)]">
            <img
              key={`bg-${active.id}`}
              src={active.imageUrl || FALLBACK_IMAGE}
              alt={active.name}
              className="absolute inset-0 h-full w-full object-cover opacity-35 blur-sm animate-[fadeIn_550ms_ease-out]"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-black/55" />

            <img
              key={`main-${active.id}`}
              src={active.imageUrl || FALLBACK_IMAGE}
              alt={active.name}
              className="absolute right-4 top-4 h-[calc(100%-2rem)] w-[58%] object-contain animate-[fadeIn_550ms_ease-out,zoomSlow_5500ms_linear]"
            />

            <div className="absolute bottom-0 left-0 z-10 max-w-[44%] p-8">
              <p className="mb-3 text-xs uppercase tracking-[0.35em] text-amber-300">Destaque da casa</p>
              <h2 className="text-4xl font-black leading-tight md:text-6xl">{active.name}</h2>
            </div>

            <div className="absolute bottom-6 right-8 flex items-center gap-2">
              {slides.slice(0, 10).map((slide, idx) => (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => setSlideIndex(idx)}
                  className={`h-2.5 rounded-full transition-all duration-300 ${
                    idx === slideIndex ? "w-10 bg-amber-300" : "w-2.5 bg-white/45 hover:bg-white/70"
                  }`}
                  aria-label={`Slide ${idx + 1}`}
                />
              ))}
            </div>
          </section>
        ) : (
          <section className="mb-5 rounded-3xl border border-white/10 bg-black/25 p-10 text-center text-white/80">
            Adicione produtos com foto para ativar o slideshow.
          </section>
        )}

        <section className="overflow-hidden rounded-2xl border border-white/10 bg-black/25 p-3">
          <div className="flex min-w-max gap-3 animate-[marqueeLeft_42s_linear_infinite]">
            {thumbProducts.map((product, idx) => (
              <button
                key={`${product.id}-${idx}`}
                type="button"
                onClick={() => setSlideIndex(idx % slides.length)}
                className="w-48 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] text-left"
              >
                <div className="h-28 w-full bg-black/35 p-2">
                  <img src={product.imageUrl || FALLBACK_IMAGE} alt={product.name} className="h-full w-full object-contain" />
                </div>
                <div className="line-clamp-2 px-3 py-2 text-sm font-semibold">{product.name}</div>
              </button>
            ))}
          </div>
        </section>
      </main>

      <footer className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-black/55 backdrop-blur">
        <div className="mx-auto max-w-[1680px] overflow-hidden px-6 py-3">
          {orders.length === 0 ? (
            <div className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/80">
              Nenhum pedido recente agora.
            </div>
          ) : (
            <div className="flex min-w-max gap-3 whitespace-nowrap animate-[marqueeLeft_32s_linear_infinite]">
              {tickerOrders.map((order, idx) => (
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
