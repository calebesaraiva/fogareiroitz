import { useAuth } from "@/_core/hooks/useAuth";
import RestaurantHeader from "@/components/RestaurantHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useGlobalLoading } from "@/contexts/GlobalLoadingContext";
import { trpc } from "@/lib/trpc";
import { LogOut, Printer, RefreshCcw, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type CashierOrder = {
  id: number;
  customerName: string;
  customerPhone: string | null;
  tableNumber: number | null;
  total: number;
  status: "pending" | "new" | "preparing" | "ready" | "delivered" | "cancelled" | "awaiting_payment" | "paid";
  serviceFeeDefault: number;
  createdAt: Date;
  items?: Array<{
    productName: string;
    quantity: number;
    totalPrice: number;
  }>;
};

type PaymentMethod = "cash" | "card" | "pix";

const methodLabel: Record<PaymentMethod, string> = {
  cash: "Dinheiro",
  card: "Cartao",
  pix: "PIX",
};

const statusLabel: Record<string, string> = {
  pending: "Aguardando aprovacao",
  new: "Aceito",
  preparing: "Em preparo",
  ready: "Pronto",
  delivered: "Entregue",
  cancelled: "Cancelado",
  awaiting_payment: "Aguardando pagamento",
  paid: "Pago",
};

const receiptBrand = {
  tradeName: "Fogareiro ITZ Restaurante",
  addressLine1: "Rua Exemplo, 123 - Centro",
  addressLine2: "Imperatriz - MA",
  phone: "(99) 98206-4866",
  whatsapp: "(99) 98206-4866",
  cnpj: "00.000.000/0001-00",
  instagram: "@fogareiroitz",
  logoUrl: "/logo-fogareiro.png",
  footerMessage: "Obrigado pela preferencia! Volte sempre.",
};

export default function CashierPanel() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const { withLoading, pulseLoading } = useGlobalLoading();
  const [, setLocation] = useLocation();

  const ordersQuery = trpc.orders.cashier.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 5000,
  });
  const markPaidMutation = trpc.orders.markPaid.useMutation();
  const closeDayMutation = trpc.orders.closeDay.useMutation();

  const now = new Date();
  const [search, setSearch] = useState("");
  const [paymentMethodByOrder, setPaymentMethodByOrder] = useState<Record<number, PaymentMethod>>({});
  const [removeFeeByOrder, setRemoveFeeByOrder] = useState<Record<number, boolean>>({});
  const [amountReceivedByOrder, setAmountReceivedByOrder] = useState<Record<number, string>>({});
  const [receiveOrder, setReceiveOrder] = useState<CashierOrder | null>(null);
  const [receiveMethod, setReceiveMethod] = useState<PaymentMethod>("cash");
  const [receiveRemoveService, setReceiveRemoveService] = useState(false);
  const [receiveAmount, setReceiveAmount] = useState("");
  const [receiveDiscount, setReceiveDiscount] = useState("");
  const [receiveDiscountAdminEmail, setReceiveDiscountAdminEmail] = useState("");
  const [receiveDiscountAdminPassword, setReceiveDiscountAdminPassword] = useState("");
  const [dateFrom, setDateFrom] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`);
  const [dateTo, setDateTo] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`);

  const reportQuery = trpc.orders.cashierReport.useQuery(
    {
      dateFrom: `${dateFrom}T00:00:00.000Z`,
      dateTo: `${dateTo}T23:59:59.999Z`,
    },
    { enabled: isAuthenticated }
  );

  useEffect(() => {
    if (!loading && (!isAuthenticated || (user?.role !== "cashier" && user?.role !== "admin"))) {
      setLocation("/login");
    }
  }, [loading, isAuthenticated, user, setLocation]);

  if (!loading && (!isAuthenticated || (user?.role !== "cashier" && user?.role !== "admin"))) {
    return null;
  }

  const formatPrice = (value: number) =>
    (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const formatPhone = (value: string | null) => {
    const digits = (value ?? "").replace(/\D/g, "");
    if (digits.length === 11) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    }
    return value ?? "-";
  };

  const orders = (ordersQuery.data ?? []) as CashierOrder[];
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const digits = search.replace(/\D/g, "");
    if (!query && !digits) return orders;
    return orders.filter((order) => {
      const byName = order.customerName.toLowerCase().includes(query);
      const byPhone = digits.length > 0 && (order.customerPhone ?? "").includes(digits);
      const byTable = digits.length > 0 && order.tableNumber !== null && String(order.tableNumber).includes(digits);
      return byName || byPhone || byTable;
    });
  }, [orders, search]);

  const calcPayment = (
    order: CashierOrder,
    method: PaymentMethod,
    removeService: boolean,
    amountText: string,
    discountText = ""
  ) => {
    const service = removeService ? 0 : Math.round(order.total * (order.serviceFeeDefault / 100));
    const preDiscountTotal = order.total + service;
    const discount = Math.max(
      0,
      Math.min(preDiscountTotal, Math.round(Number((discountText || "0").replace(",", ".")) * 100))
    );
    const finalTotal = preDiscountTotal - discount;
    const amountReceived = method === "cash" ? Math.round(Number((amountText || "0").replace(",", ".")) * 100) : finalTotal;
    const changeDue = method === "cash" ? Math.max(0, amountReceived - finalTotal) : 0;
    return { service, discount, finalTotal, amountReceived, changeDue };
  };

  const printReceipt = (
    order: CashierOrder,
    finalTotal: number,
    method: PaymentMethod,
    changeDue: number,
    serviceFeeValue: number,
    discountValue = 0
  ) => {
    const win = window.open("", "_blank");
    if (!win) return;
    const nowLabel = new Date().toLocaleString("pt-BR");
    const line = "-".repeat(32);
    const row = (label: string, value: string) => {
      const left = `${label}:`;
      const max = 32;
      const valueText = value.slice(0, max);
      const spaces = Math.max(1, max - left.length - valueText.length);
      return `${left}${" ".repeat(spaces)}${valueText}`;
    };
    const orderItems = Array.isArray(order.items) ? order.items : [];
    const itemsHtml =
      orderItems.length === 0
        ? `<div class="line">Itens: nao informado</div>`
        : orderItems
            .map((item) => {
              const qty = Number(item.quantity || 0);
              const lineTotal = Number(item.totalPrice || 0);
              const name = String(item.productName || "Item");
              return `
                <div class="line">${qty}x ${name}</div>
                <div class="line">${row(" ", formatPrice(lineTotal))}</div>
              `;
            })
            .join("");
    win.document.write(`
      <html>
        <head>
          <title>Comprovante #${order.id}</title>
          <meta charset="utf-8" />
          <style>
            @page {
              size: 80mm auto;
              margin: 3mm;
            }
            body {
              margin: 0;
              padding: 0;
              background: #fff;
              color: #000;
              font-family: "Courier New", Consolas, monospace;
              font-size: 12px;
              line-height: 1.35;
            }
            .ticket {
              width: 74mm;
              margin: 0 auto;
              padding: 2mm 1mm 3mm;
            }
            .logo-wrap {
              display: flex;
              justify-content: center;
              margin-bottom: 4px;
            }
            .logo {
              max-width: 42mm;
              max-height: 18mm;
              object-fit: contain;
              filter: grayscale(100%) contrast(1.1);
            }
            .center {
              text-align: center;
            }
            .title {
              font-size: 15px;
              font-weight: 700;
              text-transform: uppercase;
            }
            .strong {
              font-weight: 700;
            }
            .line {
              white-space: pre;
            }
            .mt {
              margin-top: 6px;
            }
            .cut {
              margin-top: 8px;
              text-align: center;
              font-size: 10px;
            }
          </style>
        </head>
        <body>
          <div class="ticket">
            <div class="logo-wrap">
              <img class="logo" src="${receiptBrand.logoUrl}" alt="Logo" onerror="this.style.display='none'" />
            </div>
            <div class="center title">${receiptBrand.tradeName}</div>
            <div class="center">${receiptBrand.addressLine1}</div>
            <div class="center">${receiptBrand.addressLine2}</div>
            <div class="center">Tel: ${receiptBrand.phone}</div>
            <div class="center">WhatsApp: ${receiptBrand.whatsapp}</div>
            <div class="center">CNPJ: ${receiptBrand.cnpj}</div>
            <div class="center">Instagram: ${receiptBrand.instagram}</div>
            <div class="line mt">${line}</div>
            <div class="center strong">COMPROVANTE DE PAGAMENTO</div>
            <div class="center">${nowLabel}</div>

            <div class="line">${row("Comanda", `#${order.id}`)}</div>
            <div class="line">${row("Cliente", order.customerName)}</div>
            <div class="line">${row("Telefone", formatPhone(order.customerPhone))}</div>
            <div class="line">${row("Mesa", order.tableNumber ? `Mesa ${order.tableNumber}` : "-")}</div>
            <div class="line">${line}</div>
            <div class="center strong">ITENS DO PEDIDO</div>
            ${itemsHtml}
            <div class="line">${line}</div>
            <div class="line">${row("Forma", methodLabel[method])}</div>
            <div class="line">${row("Subtotal", formatPrice(order.total))}</div>
            <div class="line">${row("Taxa de servico", formatPrice(serviceFeeValue))}</div>
            <div class="line">${row("Desconto", formatPrice(discountValue))}</div>
            <div class="line">${row("Total", formatPrice(finalTotal))}</div>
            <div class="line">${row("Troco", formatPrice(changeDue))}</div>
            <div class="line">${line}</div>

            <div class="center mt strong">${receiptBrand.footerMessage}</div>
            <div class="center">Nao possui valor fiscal</div>
            <div class="cut">------------------------------</div>
          </div>
          <script>
            window.onload = () => {
              window.print();
              window.onafterprint = () => window.close();
            };
          </script>
        </body>
      </html>
    `);
    win.document.close();
  };

  const sendWhatsAppReceipt = (
    order: CashierOrder,
    finalTotal: number,
    method: PaymentMethod,
    changeDue: number,
    serviceFeeValue: number,
    discountValue = 0
  ) => {
    const phone = (order.customerPhone ?? "").replace(/\D/g, "");
    if (phone.length < 10) return;
    const message = [
      "Fogareiro ITZ - Comprovante de pagamento",
      `Comanda #${order.id}`,
      `Cliente: ${order.customerName}`,
      `Forma: ${methodLabel[method]}`,
      `Taxa de servico: ${formatPrice(serviceFeeValue)}`,
      `Desconto: ${formatPrice(discountValue)}`,
      `Total pago: ${formatPrice(finalTotal)}`,
      `Troco: ${formatPrice(changeDue)}`,
      `Data: ${new Date().toLocaleString("pt-BR")}`,
    ].join("\n");
    window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(message)}`, "_blank");
  };

  const handleReceive = async (
    order: CashierOrder,
    options?: {
      method?: PaymentMethod;
      removeService?: boolean;
      amountReceivedText?: string;
      discountText?: string;
      discountAdminEmail?: string;
      discountAdminPassword?: string;
    }
  ) => {
    const method = options?.method ?? paymentMethodByOrder[order.id] ?? "cash";
    const removeService = options?.removeService ?? Boolean(removeFeeByOrder[order.id]);
    const amountText = options?.amountReceivedText ?? amountReceivedByOrder[order.id] ?? "";
    const discountText = options?.discountText ?? "";
    const { service, discount, finalTotal, amountReceived, changeDue } = calcPayment(
      order,
      method,
      removeService,
      amountText,
      discountText
    );

    if (method === "cash" && amountReceived < finalTotal) {
      toast.error("Valor em dinheiro menor que o total da conta");
      return;
    }

    if (discount > 0 && (!options?.discountAdminEmail || !options?.discountAdminPassword)) {
      toast.error("Desconto exige email e senha de admin");
      return;
    }

    try {
      await withLoading(
        () =>
          markPaidMutation.mutateAsync({
            id: order.id,
            paymentMethod: method,
            removeServiceFee: removeService,
            amountReceived,
            discountAmount: discount,
            discountApproval:
              discount > 0
                ? {
                    adminEmail: options?.discountAdminEmail ?? "",
                    adminPassword: options?.discountAdminPassword ?? "",
                  }
                : undefined,
          }),
        { message: `Recebendo comanda #${order.id}` }
      );
      await Promise.all([ordersQuery.refetch(), reportQuery.refetch()]);
      toast.success("Pagamento confirmado no caixa");
      setReceiveOrder(null);
      setReceiveDiscount("");
      setReceiveDiscountAdminEmail("");
      setReceiveDiscountAdminPassword("");
      printReceipt(order, finalTotal, method, changeDue, service, discount);
      sendWhatsAppReceipt(order, finalTotal, method, changeDue, service, discount);
    } catch (error) {
      console.error(error);
      toast.error("Nao foi possivel confirmar o pagamento");
    }
  };

  const openReceiveDialog = (order: CashierOrder) => {
    setReceiveOrder(order);
    setReceiveMethod(paymentMethodByOrder[order.id] ?? "cash");
    setReceiveRemoveService(Boolean(removeFeeByOrder[order.id]));
    setReceiveAmount(amountReceivedByOrder[order.id] ?? "");
    setReceiveDiscount("");
    setReceiveDiscountAdminEmail("");
    setReceiveDiscountAdminPassword("");
  };

  const handleCloseDay = async () => {
    try {
      const result = await withLoading(
        () => closeDayMutation.mutateAsync({ date: `${dateTo}T12:00:00.000Z` }),
        { message: "Fechando o caixa do dia" }
      );
      toast.success(`Fechamento concluido: ${formatPrice(result.totals.grossTotal)}`);
      await reportQuery.refetch();
    } catch (error) {
      console.error(error);
      toast.error("Nao foi possivel fechar o dia");
    }
  };

  return (
    <div className="mothers-day-shell min-h-screen">
      <RestaurantHeader showCart={false} title="Caixa" subtitle="Recebimentos e fechamento diario" />
      <div className="border-b border-border bg-card/95">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-2 py-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline">{filtered.length} conta(s) pendente(s)</Badge>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => Promise.all([ordersQuery.refetch(), reportQuery.refetch()])}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Atualizar
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                await logout();
                await pulseLoading("Saindo do caixa", 900);
                setLocation("/");
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </div>

      <main className="container mx-auto space-y-6 py-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><WalletCards className="h-5 w-5 text-accent" /> Contas abertas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, telefone ou mesa"
            />
            <div className="space-y-3">
              {filtered.map((order) => {
                const preview = calcPayment(order, "cash", false, "", "");
                return (
                  <div key={order.id} className="rounded-2xl border border-border/70 bg-background/40 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground">Comanda #{order.id} - {order.customerName}</p>
                        <p className="text-sm text-muted-foreground">Telefone: {formatPhone(order.customerPhone)}</p>
                        <p className="text-sm text-muted-foreground">Mesa: {order.tableNumber ? `Mesa ${order.tableNumber}` : "-"}</p>
                      </div>
                      <Badge>{statusLabel[order.status] ?? order.status}</Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Subtotal</p>
                        <p className="font-semibold">{formatPrice(order.total)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Servico (10%)</p>
                        <p className="font-semibold">{formatPrice(preview.service)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Total previsto</p>
                        <p className="font-semibold text-accent">{formatPrice(preview.finalTotal)}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        className="bg-accent text-accent-foreground hover:bg-accent/90"
                        onClick={() => openReceiveDialog(order)}
                        disabled={markPaidMutation.isPending}
                      >
                        Receber no caixa
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Relatorio do caixa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              <Button variant="outline" onClick={() => reportQuery.refetch()}>Atualizar relatorio</Button>
              <Button onClick={handleCloseDay}>Fechamento diario</Button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-border/70 p-3">
                <p className="text-xs text-muted-foreground">Total recebido</p>
                <p className="text-lg font-semibold text-accent">{formatPrice(reportQuery.data?.totals.grossTotal ?? 0)}</p>
              </div>
              <div className="rounded-xl border border-border/70 p-3">
                <p className="text-xs text-muted-foreground">Taxa de servico</p>
                <p className="text-lg font-semibold">{formatPrice(reportQuery.data?.totals.serviceFeeTotal ?? 0)}</p>
              </div>
              <div className="rounded-xl border border-border/70 p-3">
                <p className="text-xs text-muted-foreground">Pagamentos</p>
                <p className="text-lg font-semibold">{reportQuery.data?.totals.count ?? 0}</p>
              </div>
              <div className="rounded-xl border border-border/70 p-3">
                <p className="text-xs text-muted-foreground">Liquido sem servico</p>
                <p className="text-lg font-semibold">{formatPrice(reportQuery.data?.totals.netWithoutService ?? 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      <Dialog open={Boolean(receiveOrder)} onOpenChange={(open) => !open && setReceiveOrder(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Receber pagamento</DialogTitle>
            <DialogDescription>
              {receiveOrder
                ? `Comanda #${receiveOrder.id} - ${receiveOrder.customerName}`
                : "Confirme os dados para finalizar no caixa."}
            </DialogDescription>
          </DialogHeader>

          {receiveOrder ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                <p className="text-sm text-muted-foreground">Mesa: {receiveOrder.tableNumber ? `Mesa ${receiveOrder.tableNumber}` : "-"}</p>
                <p className="text-sm text-muted-foreground">Telefone: {formatPhone(receiveOrder.customerPhone)}</p>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setReceiveMethod("cash")}
                  className={`rounded-xl border px-3 py-3 text-sm font-medium transition ${
                    receiveMethod === "cash" ? "border-accent bg-accent/20 text-accent" : "border-border bg-background"
                  }`}
                >
                  Dinheiro
                </button>
                <button
                  type="button"
                  onClick={() => setReceiveMethod("card")}
                  className={`rounded-xl border px-3 py-3 text-sm font-medium transition ${
                    receiveMethod === "card" ? "border-accent bg-accent/20 text-accent" : "border-border bg-background"
                  }`}
                >
                  Cartao
                </button>
                <button
                  type="button"
                  onClick={() => setReceiveMethod("pix")}
                  className={`rounded-xl border px-3 py-3 text-sm font-medium transition ${
                    receiveMethod === "pix" ? "border-accent bg-accent/20 text-accent" : "border-border bg-background"
                  }`}
                >
                  PIX
                </button>
              </div>

              <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={!receiveRemoveService}
                  onChange={(e) => setReceiveRemoveService(!e.target.checked)}
                />
                Cobrar taxa de servico de 10%
              </label>

              <Input
                type="number"
                placeholder="Valor recebido (R$)"
                disabled={receiveMethod !== "cash"}
                value={receiveAmount}
                onChange={(e) => setReceiveAmount(e.target.value)}
              />

              <Input
                type="number"
                placeholder="Desconto (R$)"
                value={receiveDiscount}
                onChange={(e) => setReceiveDiscount(e.target.value)}
              />

              {calcPayment(receiveOrder, receiveMethod, receiveRemoveService, receiveAmount, receiveDiscount).discount > 0 ? (
                <div className="space-y-2 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3">
                  <p className="text-sm font-semibold text-amber-200">
                    Autorizacao obrigatoria de administrador para desconto
                  </p>
                  <Input
                    type="email"
                    placeholder="Email do admin"
                    value={receiveDiscountAdminEmail}
                    onChange={(e) => setReceiveDiscountAdminEmail(e.target.value)}
                  />
                  <Input
                    type="password"
                    placeholder="Senha do admin"
                    value={receiveDiscountAdminPassword}
                    onChange={(e) => setReceiveDiscountAdminPassword(e.target.value)}
                  />
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 rounded-xl border border-border/70 bg-muted/20 p-3 md:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Subtotal</p>
                  <p className="font-semibold">{formatPrice(receiveOrder.total)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Taxa de servico</p>
                  <p className="font-semibold">{formatPrice(calcPayment(receiveOrder, receiveMethod, receiveRemoveService, receiveAmount, receiveDiscount).service)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Desconto</p>
                  <p className="font-semibold">{formatPrice(calcPayment(receiveOrder, receiveMethod, receiveRemoveService, receiveAmount, receiveDiscount).discount)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 rounded-xl border border-border/70 bg-muted/20 p-3 md:grid-cols-1">
                <div>
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="font-semibold text-accent">{formatPrice(calcPayment(receiveOrder, receiveMethod, receiveRemoveService, receiveAmount, receiveDiscount).finalTotal)}</p>
                </div>
              </div>

              <div className="text-sm text-muted-foreground">
                Troco: {formatPrice(calcPayment(receiveOrder, receiveMethod, receiveRemoveService, receiveAmount, receiveDiscount).changeDue)}
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReceiveOrder(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              disabled={!receiveOrder || markPaidMutation.isPending}
              onClick={async () => {
                if (!receiveOrder) return;
                setPaymentMethodByOrder((current) => ({ ...current, [receiveOrder.id]: receiveMethod }));
                setRemoveFeeByOrder((current) => ({ ...current, [receiveOrder.id]: receiveRemoveService }));
                setAmountReceivedByOrder((current) => ({ ...current, [receiveOrder.id]: receiveAmount }));
                await handleReceive(receiveOrder, {
                  method: receiveMethod,
                  removeService: receiveRemoveService,
                  amountReceivedText: receiveAmount,
                  discountText: receiveDiscount,
                  discountAdminEmail: receiveDiscountAdminEmail,
                  discountAdminPassword: receiveDiscountAdminPassword,
                });
              }}
            >
              Confirmar recebimento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
