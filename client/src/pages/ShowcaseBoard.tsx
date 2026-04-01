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

type ShowcasePreviewPayload = {
  showcaseTitle?: string;
  showcaseSubtitle?: string;
  showcaseSlideSeconds?: number;
  showcaseSlides?: ShowcaseSlide[];
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

  const [previewSettings, setPreviewSettings] = useState<ShowcasePreviewPayload | null>(() => {
    if (!isPreviewMode || typeof window === "undefined") return null;
    const selfPreview = (window as Window & { __fogareiroShowcasePreview?: ShowcasePreviewPayload })
      .__fogareiroShowcasePreview;
    const openerPreview = (
      window.opener as (Window & { __fogareiroShowcasePreview?: ShowcasePreviewPayload }) | null
    )?.__fogareiroShowcasePreview;
    return selfPreview ?? openerPreview ?? null;
  });

  useEffect(() => {
    if (!isPreviewMode) return;

    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "fogareiro-showcase-preview") return;
      setPreviewSettings(event.data.payload as ShowcasePreviewPayload);
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
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
    <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,#3b1820_0%,#1a0c12_58%,#10070b_100%)] text-white">
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
        <div className="mx-auto flex max-w-[1680px] flex-col items-start justify-between gap-3 px-3 py-4 sm:flex-row sm:items-center sm:gap-0 sm:px-6 sm:py-5">
          <div className="flex items-center gap-3 sm:gap-4">
            <img
              src={restaurantLogo}
              alt={headerTitle}
              className="h-12 w-12 rounded-full border border-white/20 bg-black/30 p-1.5 object-contain sm:h-16 sm:w-16 sm:p-2"
            />
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-amber-300/90 sm:text-xs sm:tracking-[0.35em]">{headerSubtitle}</p>
              <h1 className="text-2xl font-bold sm:text-3xl">{headerTitle}</h1>
            </div>
          </div>
          <div className="rounded-full border border-emerald-300/35 bg-emerald-300/10 px-4 py-2 text-xs sm:text-sm">
            Painel ao vivo
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1680px] px-3 py-4 pb-24 sm:px-6 sm:py-6">
        {active ? (
          <section className="relative mb-5 h-[54vh] min-h-[320px] overflow-hidden rounded-3xl border border-white/10 bg-black/40 shadow-[0_30px_90px_rgba(0,0,0,0.35)] sm:h-[58vh] sm:min-h-[380px]">
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
              className="absolute right-2 top-2 h-[44%] w-[calc(100%-1rem)] object-contain animate-[fadeIn_550ms_ease-out,zoomSlow_5500ms_linear] sm:right-4 sm:top-4 sm:h-[calc(100%-2rem)] sm:w-[58%]"
            />

            <div className="absolute bottom-0 left-0 z-10 max-w-full p-4 sm:max-w-[44%] sm:p-8">
              <p className="mb-2 text-[10px] uppercase tracking-[0.22em] text-amber-300 sm:mb-3 sm:text-xs sm:tracking-[0.35em]">Destaque da casa</p>
              <h2 className="text-3xl font-black leading-tight sm:text-4xl md:text-6xl">{active.name}</h2>
            </div>

            <div className="absolute bottom-4 right-4 flex items-center gap-1.5 sm:bottom-6 sm:right-8 sm:gap-2">
              {slides.slice(0, 10).map((slide, idx) => (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => setSlideIndex(idx)}
                  className={`h-2.5 rounded-full transition-all duration-300 ${
                    idx === slideIndex ? "w-8 bg-amber-300 sm:w-10" : "w-2.5 bg-white/45 hover:bg-white/70"
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

        <section className="overflow-hidden rounded-2xl border border-white/10 bg-black/25 p-2 sm:p-3">
          <div className="flex min-w-max gap-2 sm:gap-3 animate-[marqueeLeft_42s_linear_infinite]">
            {thumbProducts.map((product, idx) => (
              <button
                key={`${product.id}-${idx}`}
                type="button"
                onClick={() => setSlideIndex(idx % slides.length)}
                className="w-36 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] text-left sm:w-48"
              >
                <div className="h-24 w-full bg-black/35 p-1.5 sm:h-28 sm:p-2">
                  <img src={product.imageUrl || FALLBACK_IMAGE} alt={product.name} className="h-full w-full object-contain" />
                </div>
                <div className="line-clamp-2 px-2.5 py-2 text-xs font-semibold sm:px-3 sm:text-sm">{product.name}</div>
              </button>
            ))}
          </div>
        </section>
      </main>

      <footer className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-black/55 backdrop-blur">
        <div className="mx-auto max-w-[1680px] overflow-hidden px-3 py-2 sm:px-6 sm:py-3">
          {orders.length === 0 ? (
            <div className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/80 sm:px-4 sm:py-2 sm:text-sm">
              Nenhum pedido recente agora.
            </div>
          ) : (
            <div className="flex min-w-max gap-3 whitespace-nowrap animate-[marqueeLeft_32s_linear_infinite]">
              {tickerOrders.map((order, idx) => (
                <div
                  key={`${order.id}-${idx}`}
                  className="shrink-0 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm"
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
