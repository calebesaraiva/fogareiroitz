import { Flower2, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { useGlobalLoading } from "@/contexts/GlobalLoadingContext";
import { useLocation } from "wouter";

interface RestaurantHeaderProps {
  showCart?: boolean;
  title?: string;
  subtitle?: string;
}

export default function RestaurantHeader({
  showCart = true,
  title,
  subtitle,
}: RestaurantHeaderProps) {
  const { cartCount } = useCart();
  const { pulseLoading } = useGlobalLoading();
  const [, setLocation] = useLocation();
  const restaurantName =
    import.meta.env.VITE_APP_TITLE || "Fogareiro ITZ Restaurante";
  const restaurantLogo = import.meta.env.VITE_APP_LOGO || "/fogareiro-logo.png";

  return (
    <header className="festive-header sticky top-0 z-40 border-b border-border/70 bg-card/90 shadow-[0_18px_45px_rgba(0,0,0,0.32)] backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-accent to-transparent opacity-70" />
      <div className="container relative mx-auto px-3 py-3 sm:px-4 sm:py-4">
        <div className="flex items-start justify-between gap-2 sm:items-center sm:gap-4">
          <div
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 transition-opacity hover:opacity-90 md:gap-4"
            onClick={async () => {
              await pulseLoading("Feliz Dia das Maes", 1000);
              setLocation("/");
            }}
          >
            <div className="festive-logo-frame flex-shrink-0 rounded-[1.25rem] border border-white/10 bg-black/25 p-2.5 shadow-[0_0_24px_rgba(255,124,17,0.18)] sm:rounded-[1.6rem] sm:p-3 md:p-3">
              <img
                src={restaurantLogo}
                alt={restaurantName}
                className="h-12 w-12 object-contain sm:h-16 sm:w-16 md:h-16 md:w-16 lg:h-[4.35rem] lg:w-[4.35rem]"
              />
            </div>

            <div className="flex-1 min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="festive-chip rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.24em] text-accent sm:px-3 sm:text-[10px] sm:tracking-[0.32em]">
                  Brasa acesa
                </span>
                <span className="festive-pill hidden rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.26em] text-white sm:inline-flex">
                  Dia das Maes
                </span>
              </div>
              <h1 className="max-w-[12ch] text-[1.1rem] font-black leading-[0.95] text-foreground sm:max-w-none sm:text-[1.9rem] md:text-[2.35rem]">
                {restaurantName}
              </h1>
              {subtitle && (
                <p className="mt-1.5 max-w-2xl text-[11px] text-muted-foreground sm:mt-2 sm:text-xs md:text-sm">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {title && (
            <div className="hidden flex-1 justify-end md:flex">
              <div className="festive-side-label rounded-full px-4 py-2 text-right">
                <div className="flex items-center justify-end gap-2">
                  <Flower2 className="h-4 w-4 text-accent/90" />
                  <p className="text-sm text-muted-foreground md:text-base">
                    {title}
                  </p>
                </div>
              </div>
            </div>
          )}

          {!title && !showCart && (
            <div className="hidden md:block md:w-10" aria-hidden="true" />
          )}

          {showCart && (
            <Button
              variant="outline"
              size="lg"
              className="festive-cart relative mt-1 h-11 w-11 flex-shrink-0 border-white/15 bg-black/20 p-0 text-foreground hover:bg-accent hover:text-accent-foreground sm:mt-0 sm:h-auto sm:w-auto sm:p-3"
              onClick={async () => {
                await pulseLoading("Abrindo seu pedido", 1000);
                setLocation("/carrinho");
              }}
            >
              <ShoppingCart className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground shadow-[0_0_18px_rgba(255,149,0,0.45)]">
                  {cartCount}
                </span>
              )}
            </Button>
          )}
        </div>

        <div className="mt-2 h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent sm:mt-3" />
        <div className="pointer-events-none absolute inset-x-6 top-2 hidden h-14 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,234,239,0.08),transparent_70%)] md:block" />
      </div>
    </header>
  );
}
