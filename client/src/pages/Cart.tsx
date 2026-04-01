import { persistTrackingPhone } from "@/components/OrderTrackerCard";
import RestaurantHeader from "@/components/RestaurantHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCart } from "@/contexts/CartContext";
import { useGlobalLoading } from "@/contexts/GlobalLoadingContext";
import { clearDiningTableAccess, getStoredDiningTableAccess } from "@/lib/dineInAccess";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, ClipboardCheck, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function Cart() {
  const { items, removeFromCart, updateQuantity, clearCart, total } = useCart();
  const { pulseLoading, withLoading } = useGlobalLoading();
  const [, setLocation] = useLocation();
  const tableAccess = getStoredDiningTableAccess();
  const tableAccessQuery = trpc.tables.resolvePublicAccess.useQuery(
    { token: tableAccess?.publicToken || "" },
    { enabled: !!tableAccess?.publicToken, retry: false }
  );
  const createOrderMutation = trpc.orders.create.useMutation();

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const normalizedPhone = useMemo(() => customerPhone.replace(/\D/g, ""), [customerPhone]);
  const isTableAccessInvalid = (tableAccessQuery.error?.message || "")
    .toLowerCase()
    .includes("mesa nao autorizada");
  const resolvedTable = isTableAccessInvalid ? null : tableAccessQuery.data ?? tableAccess;

  useEffect(() => {
    if (!isTableAccessInvalid) return;
    clearDiningTableAccess();
    toast.error("QR Code da mesa invalido ou expirado", {
      description: "Escaneie novamente o QR Code da mesa para liberar o pedido.",
    });
  }, [isTableAccessInvalid]);

  const formatPrice = (price: number) =>
    (price / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  const resetCheckout = () => {
    clearCart();
    setCustomerName("");
    setCustomerPhone("");
    setNotes("");
  };

  const validateCheckout = () => {
    if (!customerName.trim()) {
      toast.error("Informe o nome do cliente", {
        description: "Esse dado ajuda a cozinha e o atendimento a identificar o pedido.",
      });
      return false;
    }

    if (items.length === 0) {
      toast.error("Seu carrinho esta vazio", {
        description: "Adicione pelo menos um item antes de finalizar o pedido.",
      });
      return false;
    }

    if (!resolvedTable?.id || !resolvedTable?.publicToken) {
      toast.error("Pedido presencial nao autorizado", {
        description: "Escaneie o QR da mesa dentro do restaurante para liberar o pedido.",
      });
      return false;
    }

    if (normalizedPhone.length < 10) {
      toast.error("Informe um telefone para contato", {
        description: "Use um numero valido com DDD. Ele sera usado para acompanhar o pedido.",
      });
      return false;
    }

    return true;
  };

  const submitOrder = async () => {
    if (!validateCheckout()) return;

    try {
      const createdOrder = await withLoading(
        () =>
          createOrderMutation.mutateAsync({
            customerName: customerName.trim(),
            customerPhone: normalizedPhone,
            orderType: "dine_in",
            tableId: Number(resolvedTable?.id),
            tableToken: resolvedTable?.publicToken || "",
            notes: notes.trim() || undefined,
            total,
            items: items.map((item) => ({
              productId: Number(item.id),
              productName: item.name,
              quantity: item.quantity,
              unitPrice: item.price,
              totalPrice: item.price * item.quantity,
              imageUrl: item.imageUrl,
              customization: item.customization,
              observations: item.observations || undefined,
            })),
          }),
        { message: "Enviando pedido para o restaurante", minDurationMs: 1200 }
      );

      persistTrackingPhone(normalizedPhone);

      resetCheckout();
      toast.success("Pedido enviado para a cozinha", {
        description: "Use esse mesmo telefone para acompanhar o status do pedido.",
      });
      await pulseLoading("Pedido enviado com sucesso", 900);
      setLocation("/acompanhar");
    } catch (error) {
      console.error("Error creating order:", error);
      toast.error("Nao foi possivel finalizar o pedido", {
        description: "Tente novamente em alguns instantes.",
      });
    }
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <RestaurantHeader showCart={false} />

        <main className="container mx-auto px-4 py-12">
          <div className="flex h-64 flex-col items-center justify-center">
            <div className="text-center">
              <h2 className="mb-2 text-2xl font-bold text-foreground">Carrinho vazio</h2>
              <p className="mb-6 text-muted-foreground">
                Adicione alguns pratos ao seu carrinho para comecar
              </p>
              <Button
                onClick={async () => {
                  await pulseLoading("Voltando ao cardapio", 950);
                  setLocation("/");
                }}
                className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
              >
                <ArrowLeft className="h-4 w-4" />
                Ver cardapio
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="mothers-day-shell min-h-screen bg-background">
      <RestaurantHeader showCart={false} />

      <main className="container mx-auto px-4 py-6 md:py-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 xl:gap-8">
          <div className="space-y-4 lg:col-span-2">
            <div className="mothers-day-hero-panel mb-6 rounded-[1.75rem] border border-white/10 p-5 shadow-[0_20px_50px_rgba(0,0,0,0.18)] backdrop-blur md:p-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-accent/90">
                Especial Dia das Maes
              </p>
              <h2 className="text-2xl font-bold text-foreground md:text-3xl">
                Pedido presencial no restaurante
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                Esse checkout fica liberado apenas para clientes que estejam dentro do restaurante, em uma mesa autorizada.
              </p>
            </div>

            <div className="rounded-2xl border border-border/70 bg-card/85 p-4 text-sm text-muted-foreground shadow-[0_12px_28px_rgba(0,0,0,0.12)]">
              {resolvedTable ? (
                <span>
                  Pedido vinculado a <strong className="text-foreground">Mesa {resolvedTable.number}</strong>.
                </span>
              ) : (
                <span>Escaneie o QR da mesa para liberar o pedido presencial.</span>
              )}
            </div>

            {items.map((item, index) => (
              <Card key={item.lineId || `${item.id}-${index}`} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-4 sm:flex-row">
                    {item.imageUrl && (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="h-24 w-full rounded-lg object-cover sm:w-24"
                      />
                    )}
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground">{item.name}</h3>
                      {item.customization !== "completo" && (
                        <p className="text-sm text-muted-foreground">Tipo: {item.customization}</p>
                      )}
                      {item.observations && (
                        <p className="text-sm text-muted-foreground">Obs: {item.observations}</p>
                      )}
                      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <span className="font-semibold text-accent">
                          {formatPrice(item.price * item.quantity)}
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateQuantity(item.lineId, item.quantity - 1)}
                          >
                            -
                          </Button>
                          <span className="w-8 text-center font-semibold">{item.quantity}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateQuantity(item.lineId, item.quantity + 1)}
                          >
                            +
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFromCart(item.lineId)}
                            className="text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="lg:col-span-1">
            <Card className="border-border/70 bg-card/92 shadow-[0_24px_60px_rgba(0,0,0,0.2)] lg:sticky lg:top-24">
              <CardHeader>
                <CardTitle>Fechamento do Pedido</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2 border-b border-border pb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal:</span>
                    <span>{formatPrice(total)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total:</span>
                    <span className="text-accent">{formatPrice(total)}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="mb-2 block text-sm font-semibold">Nome do cliente</label>
                    <Input
                      placeholder="Ex: Joao Silva"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="bg-input text-foreground placeholder-muted-foreground"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold">
                      Telefone para contato
                    </label>
                    <Input
                      placeholder="(85) 98765-4321"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="bg-input text-foreground placeholder-muted-foreground"
                      inputMode="tel"
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      Esse mesmo telefone sera pedido na tela de acompanhamento.
                    </p>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold">
                      Observacoes do pedido
                    </label>
                    <textarea
                      placeholder="Ex: aniversario, pressa no preparo, ponto da carne..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full rounded-lg border border-input bg-background p-3 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                      rows={3}
                    />
                  </div>
                </div>

                <Button
                  onClick={submitOrder}
                  disabled={createOrderMutation.isPending}
                  className="h-12 w-full gap-2 bg-accent font-semibold text-accent-foreground hover:bg-accent/90"
                >
                  <ClipboardCheck className="h-4 w-4" />
                  {createOrderMutation.isPending
                    ? "Enviando para a cozinha..."
                    : "Finalizar pedido"}
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  Seu pedido vai para aprovacao no painel interno da equipe antes do preparo.
                  Use o mesmo telefone na tela de acompanhamento.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
