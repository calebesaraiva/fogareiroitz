import RestaurantHeader from "@/components/RestaurantHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCart } from "@/contexts/CartContext";
import { useGlobalLoading } from "@/contexts/GlobalLoadingContext";
import { clearDiningTableAccess, getStoredDiningTableAccess, saveDiningTableAccess, type DiningTableAccess } from "@/lib/dineInAccess";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";

type CatalogProduct = {
  id: number;
  categoryId: number | null;
  categoryName: string | null;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  ingredients: string | null;
};

const FALLBACK_IMAGE =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'><rect width='100%25' height='100%25' fill='%23f3efe8'/><text x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23725a3a' font-family='Arial' font-size='36'>Sem imagem</text></svg>";

const getCategoryAnchor = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "sem-categoria";

export default function Catalog() {
  const { data: products, isLoading } = trpc.products.list.useQuery();
  const { addToCart } = useCart();
  const { pulseLoading } = useGlobalLoading();
  const [, setLocation] = useLocation();
  const [tableAccess, setTableAccess] = useState<DiningTableAccess | null>(() => getStoredDiningTableAccess());
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [observations, setObservations] = useState("");
  const [customization, setCustomization] = useState("completo");
  const mesaToken = useMemo(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    return params.get("mesaToken") || params.get("token") || "";
  }, []);
  const tableAccessQuery = trpc.tables.resolvePublicAccess.useQuery(
    { token: mesaToken },
    { enabled: mesaToken.length >= 12, retry: false }
  );

  useEffect(() => {
    if (tableAccessQuery.data) {
      saveDiningTableAccess(tableAccessQuery.data);
      setTableAccess(tableAccessQuery.data);
    }
  }, [tableAccessQuery.data]);

  useEffect(() => {
    if (mesaToken && tableAccessQuery.error) {
      clearDiningTableAccess();
      setTableAccess(null);
    }
  }, [mesaToken, tableAccessQuery.error]);

  const hasPresentialAccess = !!tableAccess;

  const filteredProducts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const source = (products ?? []) as CatalogProduct[];

    if (!normalizedSearch) {
      return source;
    }

    return source.filter((product) => {
      const haystack = [
        product.name,
        product.description ?? "",
        product.categoryName ?? "",
        product.ingredients ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [products, searchTerm]);

  const groupedProducts = useMemo(() => {
    const groups = new Map<string, CatalogProduct[]>();

    filteredProducts.forEach((product) => {
      const key = product.categoryName?.trim() || "Sem categoria";
      const current = groups.get(key) ?? [];
      current.push(product);
      groups.set(key, current);
    });

    return Array.from(groups.entries());
  }, [filteredProducts]);

  const categoryLinks = useMemo(
    () =>
      groupedProducts.map(([categoryName, categoryProducts]) => ({
        anchor: getCategoryAnchor(categoryName),
        name: categoryName,
        count: categoryProducts.length,
      })),
    [groupedProducts]
  );

  const handleAddToCart = async () => {
    if (!selectedProduct) return;
    if (!hasPresentialAccess) return;

    await pulseLoading("Adicionando ao seu pedido", 850);
    addToCart({
      id: selectedProduct.id,
      name: selectedProduct.name,
      price: selectedProduct.price,
      imageUrl: selectedProduct.imageUrl ?? undefined,
      quantity,
      observations,
      customization,
    });

    setSelectedProduct(null);
    setQuantity(1);
    setObservations("");
    setCustomization("completo");
  };

  const formatPrice = (price: number) =>
    (price / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  const scrollToCategory = async (anchor: string) => {
    const section = document.getElementById(anchor);
    if (!section) return;

    await pulseLoading("Carregando o cardapio", 650);
    section.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <div className="mothers-day-shell min-h-screen bg-background">
      <RestaurantHeader showCart />

      <main className="container mx-auto py-6 md:py-8">
        <section className="fogareiro-hero mothers-day-hero mb-8 overflow-hidden rounded-[2rem] border border-white/10 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.28)] sm:p-6 md:p-8">
          <div className="relative z-10 max-w-3xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.38em] text-accent/90">
              Especial Dia das Maes
            </p>
            <h2 className="max-w-2xl text-2xl font-bold leading-tight text-foreground sm:text-3xl md:text-5xl">
              Sabores intensos, clima de brasa e um cardapio pronto para abrir o apetite.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
              Explore o cardapio completo, descubra os pratos da casa e sinta o clima do Fogareiro antes mesmo de chegar.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                variant="outline"
                className="rounded-full border-white/15 bg-black/20 text-foreground hover:bg-accent hover:text-accent-foreground"
                onClick={async () => {
                  await pulseLoading("Abrindo acompanhamento do pedido", 950);
                  setLocation("/acompanhar");
                }}
              >
                Acompanhar pedido
              </Button>
              <p className="max-w-md text-xs leading-5 text-muted-foreground">
                Para acompanhar, informe apenas o numero de telefone usado no pedido.
              </p>
            </div>
            <div className="mt-5 rounded-[1.65rem] border border-white/10 bg-black/15 p-4 text-sm text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              {hasPresentialAccess ? (
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/12 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-accent">
                    <span className="inline-flex h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_0_6px_rgba(255,138,109,0.14)]" />
                    Pedido liberado no local
                  </div>
                  <p className="text-sm leading-6 text-foreground">
                    Voce esta navegando com acesso presencial ativo para a{" "}
                    <strong className="text-accent">Mesa {tableAccess.number}</strong>.
                  </p>
                  <p className="leading-6">
                    Escolha seus pratos, informe nome e telefone no checkout e acompanhe tudo em tempo real enquanto a equipe prepara seu pedido.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm leading-6 text-foreground">
                    O cardapio esta aberto para voce conhecer nossos sabores, mas os pedidos sao liberados apenas dentro do restaurante.
                  </p>
                  <p className="leading-6">
                    Venha viver a experiencia do Fogareiro ITZ, escolha sua mesa, escaneie o QR Code e prove pratos feitos para surpreender do primeiro aroma ao ultimo detalhe.
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.22em] text-accent/90">
                    <span className="rounded-full border border-accent/25 bg-accent/10 px-3 py-1.5">
                      Pedido presencial
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                      QR liberado na mesa
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                      Atendimento no salao
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <div className="mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Buscar pratos, bebidas ou categorias..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-12 pl-10 text-base"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="text-center">
              <div className="global-loading-mark mx-auto">
                <div className="global-loading-mark-ring" />
                <img
                  src={import.meta.env.VITE_APP_LOGO || "/fogareiro-logo.png"}
                  alt={import.meta.env.VITE_APP_TITLE || "Fogareiro ITZ Restaurante"}
                  className="global-loading-mark-logo"
                />
              </div>
              <p className="mt-4 text-sm font-semibold uppercase tracking-[0.28em] text-accent/90">
                Feliz Dia das Maes
              </p>
              <p className="mt-2 text-muted-foreground">Carregando cardapio...</p>
            </div>
          </div>
        ) : groupedProducts.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <div className="text-center">
              <p className="text-lg text-muted-foreground">
                Nenhum produto encontrado
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-10">
            <div className="sticky top-20 z-30 rounded-[1.75rem] border border-border/70 bg-card/88 px-4 py-4 shadow-[0_18px_45px_rgba(0,0,0,0.2)] backdrop-blur supports-[backdrop-filter]:bg-card/82">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                <p className="text-sm font-semibold text-foreground">
                  Ir direto para uma categoria
                </p>
                <p className="text-xs text-muted-foreground">
                  Toque em um botao para navegar pelo cardapio mais rapido
                </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/10 bg-background/55 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.25em] text-accent/90">
                    Arraste para o lado
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-full border-accent/35 bg-accent/10 text-accent hover:bg-accent hover:text-accent-foreground"
                    onClick={async () => {
                      await pulseLoading("Abrindo acompanhamento do pedido", 900);
                      setLocation("/acompanhar");
                    }}
                  >
                    Ver como esta seu pedido
                  </Button>
                </div>
              </div>

              <div className="category-rail-mask overflow-hidden">
              <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
                {categoryLinks.map((category) => (
                  <Button
                    key={category.anchor}
                    type="button"
                    variant="outline"
                    className="h-auto flex-none rounded-full border-border/80 bg-background/65 px-5 py-2.5 text-sm font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] transition hover:border-accent/70 hover:bg-accent hover:text-accent-foreground"
                    onClick={() => void scrollToCategory(category.anchor)}
                  >
                    <span>{category.name}</span>
                    <span className="rounded-full bg-white/8 px-2 py-0.5 text-xs text-muted-foreground">
                      {category.count}
                    </span>
                  </Button>
                ))}
              </div>
              </div>
            </div>

            {groupedProducts.map(([categoryName, categoryProducts]) => (
              <section
                key={categoryName}
                id={getCategoryAnchor(categoryName)}
                className="scroll-mt-40 space-y-4"
              >
                <div className="flex flex-col gap-2 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-foreground">
                      {categoryName}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {categoryProducts.length} item(ns)
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {categoryProducts.map((product) => (
                    <Card
                      key={product.id}
                      className={`group overflow-hidden border-border/70 bg-card/92 transition-all duration-300 ${
                        hasPresentialAccess
                          ? "cursor-pointer hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(0,0,0,0.18)]"
                          : "cursor-default"
                      }`}
                      onClick={async () => {
                        if (!hasPresentialAccess) return;
                        await pulseLoading("Abrindo detalhes do prato", 900);
                        setSelectedProduct(product);
                      }}
                    >
                      <div className="relative h-48 overflow-hidden bg-muted">
                        <img
                          src={product.imageUrl || FALLBACK_IMAGE}
                          alt={product.name}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/45 to-transparent opacity-80" />
                      </div>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-3">
                          <CardTitle className="line-clamp-2">{product.name}</CardTitle>
                          <span className="rounded-full border border-white/10 bg-background/50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-accent/90">
                            Destaque
                          </span>
                        </div>
                        {product.description && (
                          <CardDescription className="line-clamp-3">
                            {product.description}
                          </CardDescription>
                        )}
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-2xl font-bold text-accent">
                            {formatPrice(product.price)}
                          </span>
                          <Button
                            size="sm"
                            disabled={!hasPresentialAccess}
                            className="rounded-full bg-accent px-4 text-accent-foreground hover:bg-accent/90"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!hasPresentialAccess) return;
                              await pulseLoading("Abrindo detalhes do prato", 900);
                              setSelectedProduct(product);
                            }}
                          >
                            {hasPresentialAccess ? "Adicionar" : "Somente no local"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      <Dialog open={!!selectedProduct} onOpenChange={() => setSelectedProduct(null)}>
        <DialogContent className="max-h-[calc(100dvh-0.75rem)] max-w-[58rem] overflow-hidden p-0 lg:max-w-[62rem]">
          <div className="max-h-[calc(100dvh-0.75rem)] overflow-y-auto">
            <div className="lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)] lg:items-stretch">
              {selectedProduct && (
                <div className="relative h-44 overflow-hidden bg-muted sm:h-64 lg:h-full lg:min-h-[34rem]">
                  <img
                    src={selectedProduct.imageUrl || FALLBACK_IMAGE}
                    alt={selectedProduct.name}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-4 sm:p-5 lg:p-6">
                    <div className="inline-flex rounded-full bg-white/15 px-3 py-1 text-[11px] font-medium text-white backdrop-blur sm:text-xs">
                      {selectedProduct.categoryName || "Sem categoria"}
                    </div>
                    <p className="mt-3 text-xl font-bold text-white sm:text-2xl lg:text-3xl">
                      {selectedProduct.name}
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-4 px-4 pb-4 sm:px-6 sm:pb-6 lg:flex lg:min-h-[34rem] lg:flex-col lg:justify-between lg:px-6 lg:py-6">
                <div className="space-y-4">
                  <DialogHeader className="space-y-2 text-left">
                    <DialogTitle className="sr-only">{selectedProduct?.name}</DialogTitle>
                    <DialogDescription className="text-sm leading-6 text-muted-foreground lg:text-base">
                      {selectedProduct?.description || selectedProduct?.categoryName}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="rounded-2xl bg-muted p-4 lg:p-5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className="font-semibold">{"Pre\u00e7o:"}</span>
                      <span className="text-2xl font-bold text-accent lg:text-3xl">
                        {formatPrice(selectedProduct?.price || 0)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Quantidade:</label>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-w-11"
                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      >
                        -
                      </Button>
                      <span className="w-8 text-center font-semibold">{quantity}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-w-11"
                        onClick={() => setQuantity(quantity + 1)}
                      >
                        +
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold">Tipo de preparo:</label>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Button
                        variant={customization === "completo" ? "default" : "outline"}
                        size="sm"
                        className={customization === "completo" ? "bg-accent text-accent-foreground" : ""}
                        onClick={() => setCustomization("completo")}
                      >
                        Completo
                      </Button>
                      <Button
                        variant={customization === "sem-ingredientes" ? "default" : "outline"}
                        size="sm"
                        className={customization === "sem-ingredientes" ? "bg-accent text-accent-foreground" : ""}
                        onClick={() => setCustomization("sem-ingredientes")}
                      >
                        Sem ingredientes
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold">{"Observa\u00e7\u00f5es:"}</label>
                    <textarea
                      placeholder="Ex: Sem cebola, com molho extra..."
                      value={observations}
                      onChange={(e) => setObservations(e.target.value)}
                      className="min-h-24 w-full rounded-lg border border-input bg-background p-3 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent lg:min-h-32"
                      rows={4}
                    />
                  </div>
                </div>

                <Button
                  onClick={handleAddToCart}
                  disabled={!hasPresentialAccess}
                  className="h-12 w-full bg-accent text-base font-semibold text-accent-foreground hover:bg-accent/90 lg:h-14"
                >
                  {hasPresentialAccess ? "Adicionar ao Carrinho" : "Pedido liberado so na mesa"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
