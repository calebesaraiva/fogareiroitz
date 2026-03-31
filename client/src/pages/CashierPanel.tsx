import { useAuth } from "@/_core/hooks/useAuth";
import RestaurantHeader from "@/components/RestaurantHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  status: "pending" | "new" | "preparing" | "ready" | "delivered" | "cancelled";
  serviceFeeDefault: number;
  createdAt: Date;
};

type PaymentMethod = "cash" | "card" | "pix";

const methodLabel: Record<PaymentMethod, string> = {
  cash: "Dinheiro",
  card: "Cartao",
  pix: "PIX",
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

  const printReceipt = (order: CashierOrder, finalTotal: number, method: PaymentMethod, changeDue: number) => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head><title>Comprovante #${order.id}</title></head>
      <body style="font-family: Arial; padding: 20px">
        <h2>Fogareiro ITZ Restaurante</h2>
        <p>Comprovante de pagamento</p>
        <hr />
        <p><strong>Comanda:</strong> #${order.id}</p>
        <p><strong>Cliente:</strong> ${order.customerName}</p>
        <p><strong>Telefone:</strong> ${formatPhone(order.customerPhone)}</p>
        <p><strong>Mesa:</strong> ${order.tableNumber ? `Mesa ${order.tableNumber}` : "-"}</p>
        <p><strong>Forma:</strong> ${methodLabel[method]}</p>
        <p><strong>Total pago:</strong> ${formatPrice(finalTotal)}</p>
        <p><strong>Troco:</strong> ${formatPrice(changeDue)}</p>
        <p><strong>Data:</strong> ${new Date().toLocaleString("pt-BR")}</p>
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  const sendWhatsAppReceipt = (order: CashierOrder, finalTotal: number, method: PaymentMethod, changeDue: number) => {
    const phone = (order.customerPhone ?? "").replace(/\D/g, "");
    if (phone.length < 10) return;
    const message = [
      "Fogareiro ITZ - Comprovante de pagamento",
      `Comanda #${order.id}`,
      `Cliente: ${order.customerName}`,
      `Forma: ${methodLabel[method]}`,
      `Total pago: ${formatPrice(finalTotal)}`,
      `Troco: ${formatPrice(changeDue)}`,
      `Data: ${new Date().toLocaleString("pt-BR")}`,
    ].join("\n");
    window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(message)}`, "_blank");
  };

  const handleReceive = async (order: CashierOrder) => {
    const method = paymentMethodByOrder[order.id] ?? "cash";
    const removeService = Boolean(removeFeeByOrder[order.id]);
    const service = removeService ? 0 : Math.round(order.total * (order.serviceFeeDefault / 100));
    const finalTotal = order.total + service;
    const amountReceived = method === "cash"
      ? Math.round(Number((amountReceivedByOrder[order.id] || "0").replace(",", ".")) * 100)
      : finalTotal;
    const changeDue = method === "cash" ? Math.max(0, amountReceived - finalTotal) : 0;

    if (method === "cash" && amountReceived < finalTotal) {
      toast.error("Valor em dinheiro menor que o total da conta");
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
          }),
        { message: `Recebendo comanda #${order.id}` }
      );
      await Promise.all([ordersQuery.refetch(), reportQuery.refetch()]);
      toast.success("Pagamento confirmado no caixa");
      printReceipt(order, finalTotal, method, changeDue);
      sendWhatsAppReceipt(order, finalTotal, method, changeDue);
    } catch (error) {
      console.error(error);
      toast.error("Nao foi possivel confirmar o pagamento");
    }
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
                const method = paymentMethodByOrder[order.id] ?? "cash";
                const removeService = Boolean(removeFeeByOrder[order.id]);
                const service = removeService ? 0 : Math.round(order.total * (order.serviceFeeDefault / 100));
                const finalTotal = order.total + service;
                const amountReceived = Math.round(Number((amountReceivedByOrder[order.id] || "0").replace(",", ".")) * 100);
                const changeDue = method === "cash" ? Math.max(0, amountReceived - finalTotal) : 0;

                return (
                  <div key={order.id} className="rounded-2xl border border-border/70 bg-background/40 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground">Comanda #{order.id} - {order.customerName}</p>
                        <p className="text-sm text-muted-foreground">Telefone: {formatPhone(order.customerPhone)}</p>
                        <p className="text-sm text-muted-foreground">Mesa: {order.tableNumber ? `Mesa ${order.tableNumber}` : "-"}</p>
                      </div>
                      <Badge>{order.status}</Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Subtotal</p>
                        <p className="font-semibold">{formatPrice(order.total)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Servico</p>
                        <p className="font-semibold">{formatPrice(service)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Total</p>
                        <p className="font-semibold text-accent">{formatPrice(finalTotal)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Forma</p>
                        <select
                          value={method}
                          onChange={(e) =>
                            setPaymentMethodByOrder((current) => ({
                              ...current,
                              [order.id]: e.target.value as PaymentMethod,
                            }))
                          }
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                        >
                          <option value="cash">Dinheiro</option>
                          <option value="card">Cartao</option>
                          <option value="pix">PIX</option>
                        </select>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto] md:items-center">
                      <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={removeService}
                          onChange={(e) =>
                            setRemoveFeeByOrder((current) => ({
                              ...current,
                              [order.id]: e.target.checked,
                            }))
                          }
                        />
                        Remover 10% nesta conta
                      </label>
                      <Input
                        type="number"
                        placeholder="Valor recebido (R$)"
                        disabled={method !== "cash"}
                        value={amountReceivedByOrder[order.id] ?? ""}
                        onChange={(e) =>
                          setAmountReceivedByOrder((current) => ({
                            ...current,
                            [order.id]: e.target.value,
                          }))
                        }
                      />
                      <div className="text-sm text-muted-foreground">Troco: {formatPrice(changeDue)}</div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        className="bg-accent text-accent-foreground hover:bg-accent/90"
                        onClick={() => handleReceive(order)}
                        disabled={markPaidMutation.isPending}
                      >
                        Receber no caixa
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => printReceipt(order, finalTotal, method, changeDue)}
                      >
                        <Printer className="mr-2 h-4 w-4" />
                        Imprimir comprovante
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
    </div>
  );
}
