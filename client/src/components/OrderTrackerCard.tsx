import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { Clock3, Printer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const PHONE_STORAGE_KEY = "fogareiro:lastCustomerPhone";

const STATUS_LABEL: Record<string, string> = {
  pending: "Aguardando aprovacao",
  new: "Pedido aceito",
  preparing: "Em preparo",
  ready: "Pronto",
  awaiting_payment: "Aguardando pagamento",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

const TRACK_STEPS = [
  { key: "pending", label: "Aguardando" },
  { key: "new", label: "Aceito" },
  { key: "preparing", label: "Em preparo" },
  { key: "ready", label: "Pronto" },
  { key: "awaiting_payment", label: "Pagamento" },
  { key: "delivered", label: "Entregue" },
];

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  pix: "Pix",
  card: "Cartao",
  cash: "Dinheiro",
};

const RESTAURANT_CNPJ = "14.218.538/0001-81";
const RESTAURANT_ADDRESS =
  "Av. Pedro Neiva de Santana, 775 - Camacari, Imperatriz - MA, 65919-555";

export function persistTrackingPhone(customerPhone: string) {
  localStorage.setItem(PHONE_STORAGE_KEY, customerPhone.replace(/\D/g, ""));
}

export default function OrderTrackerCard() {
  const [customerPhone, setCustomerPhone] = useState("");
  const [nowTs, setNowTs] = useState(() => Date.now());
  const normalizedPhone = useMemo(() => customerPhone.replace(/\D/g, ""), [customerPhone]);
  const restaurantName = import.meta.env.VITE_APP_TITLE || "Fogareiro ITZ Restaurante";
  const restaurantLogo = import.meta.env.VITE_APP_LOGO || "/fogareiro-logo.png";
  const restaurantPhone = import.meta.env.VITE_RESTAURANT_PHONE || "";

  const trackQuery = trpc.orders.track.useQuery(
    { customerPhone: normalizedPhone },
    {
      enabled: normalizedPhone.length >= 10,
      refetchInterval: 10000,
    }
  );

  useEffect(() => {
    const savedPhone = localStorage.getItem(PHONE_STORAGE_KEY);
    if (savedPhone) {
      setCustomerPhone(savedPhone);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTs(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const order = trackQuery.data;
  const currentStepIndex = order
    ? TRACK_STEPS.findIndex((step) => step.key === order.status)
    : -1;

  const estimatedProgress = useMemo(() => {
    if (!order?.estimatedReadyMinutes) return null;

    const createdAt = new Date(order.createdAt).getTime();
    const totalMs = order.estimatedReadyMinutes * 60_000;
    const elapsedMs = Math.max(0, nowTs - createdAt);
    const remainingMs = totalMs - elapsedMs;
    const progress = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));
    const remainingMinutes = Math.max(0, Math.ceil(remainingMs / 60_000));
    const remainingSeconds = Math.max(0, Math.ceil((remainingMs % 60_000) / 1000));

    return {
      progress,
      isLate: remainingMs < 0,
      remainingMinutes,
      remainingSeconds,
      elapsedMinutes: Math.floor(elapsedMs / 60_000),
    };
  }, [nowTs, order]);

  const formatPrice = (price: number) =>
    (price / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length === 13 && digits.startsWith("55")) {
      return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
    }
    if (digits.length === 11) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    }
    return value;
  };

  const handlePrintReceipt = () => {
    if (!order) return;

    const receiptWindow = window.open("", "_blank");
    if (!receiptWindow) return;

    const receiptItems = Array.isArray(order.items) ? order.items : [];

    const itemsMarkup = receiptItems.length > 0
      ? receiptItems
      .map((item) => {
        const note = item.observations ? `<p class="meta">Obs: ${item.observations}</p>` : "";
        const customization =
          item.customization && item.customization !== "completo"
            ? `<p class="meta">Tipo: ${item.customization}</p>`
            : "";

        return `
          <div class="item">
            <div class="item-row">
              <strong>${item.quantity}x ${item.productName}</strong>
              <strong>${formatPrice(item.totalPrice)}</strong>
            </div>
            ${customization}
            ${note}
          </div>
        `;
      })
      .join("")
      : `
        <div class="item item-empty">
          <p class="meta">Os itens desse pedido nao puderam ser exibidos nesta consulta.</p>
        </div>
      `;

    receiptWindow.document.write(`
      <html>
        <head>
          <title>Notinha - ${restaurantName}</title>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
          <style>
            * {
              box-sizing: border-box;
            }
            body {
              margin: 0;
              padding: clamp(12px, 4vw, 22px);
              font-family: Arial, sans-serif;
              background: #fff8f8;
              color: #3a1a22;
            }
            .receipt {
              width: min(100%, 42rem);
              margin: 0 auto;
              border: 2px solid #d88ca0;
              border-radius: clamp(20px, 4vw, 28px);
              padding: clamp(16px, 4vw, 28px);
              background:
                radial-gradient(circle at top right, rgba(250, 214, 223, 0.5), transparent 28%),
                linear-gradient(180deg, #fffdfd 0%, #fff5f7 100%);
              box-shadow: 0 18px 40px rgba(92, 34, 51, 0.12);
            }
            .brand {
              text-align: center;
              border-bottom: 1px dashed #d8a2b0;
              padding-bottom: 14px;
              margin-bottom: 14px;
            }
            .brand img {
              width: clamp(74px, 20vw, 96px);
              height: clamp(74px, 20vw, 96px);
              object-fit: contain;
              display: block;
              margin: 0 auto 10px;
            }
            .brand h1 {
              font-size: clamp(28px, 6vw, 34px);
              margin: 0;
              line-height: 1.08;
            }
            .brand p {
              margin: 6px 0 0;
              color: #8b5564;
              font-size: clamp(13px, 3.5vw, 16px);
              letter-spacing: 0.18em;
              text-transform: uppercase;
            }
            .brand-meta {
              margin-top: 12px;
              padding-top: 12px;
              border-top: 1px dashed #e8b8c4;
              color: #7f5662;
              font-size: clamp(13px, 3.3vw, 15px);
              line-height: 1.55;
            }
            .section {
              margin-top: 16px;
            }
            .label {
              font-size: clamp(12px, 3vw, 13px);
              letter-spacing: 0.18em;
              text-transform: uppercase;
              color: #8b5564;
              margin-bottom: 8px;
            }
            .line {
              display: flex;
              justify-content: space-between;
              gap: 12px;
              margin: 6px 0;
              font-size: clamp(15px, 4vw, 18px);
              line-height: 1.4;
            }
            .item {
              border: 1px solid #efc8d3;
              border-radius: 14px;
              padding: clamp(12px, 3vw, 16px);
              margin-bottom: 10px;
              background: rgba(255,255,255,0.78);
            }
            .item-row {
              display: flex;
              justify-content: space-between;
              gap: 12px;
              font-size: clamp(15px, 4vw, 17px);
              line-height: 1.4;
            }
            .meta {
              margin: 6px 0 0;
              color: #7a5461;
              font-size: clamp(13px, 3.5vw, 14px);
            }
            .item-empty {
              text-align: center;
              background: rgba(255, 246, 248, 0.92);
            }
            .total {
              margin-top: 14px;
              padding-top: 14px;
              border-top: 1px dashed #d8a2b0;
              font-size: clamp(24px, 6vw, 32px);
              font-weight: 700;
              display: flex;
              justify-content: space-between;
              gap: 12px;
            }
            .footer {
              margin-top: 16px;
              text-align: center;
              font-size: clamp(13px, 3.5vw, 15px);
              color: #8b5564;
              line-height: 1.5;
            }
            @media (max-width: 540px) {
              .line,
              .item-row,
              .total {
                flex-direction: column;
                align-items: flex-start;
              }
            }
          </style>
        </head>
        <body>
          <div class="receipt">
            <div class="brand">
              <img src="${restaurantLogo}" alt="${restaurantName}" />
              <h1>${restaurantName}</h1>
              <p>Feliz Dia das Maes</p>
              <div class="brand-meta">
                <div><strong>CNPJ:</strong> ${RESTAURANT_CNPJ}</div>
                <div>${RESTAURANT_ADDRESS}</div>
                ${restaurantPhone ? `<div><strong>Contato:</strong> ${formatPhone(restaurantPhone)}</div>` : ""}
              </div>
            </div>

            <div class="section">
              <div class="label">Cliente</div>
              <div class="line"><span>Nome</span><strong>${order.customerName}</strong></div>
              <div class="line"><span>Telefone</span><strong>${formatPhone(order.customerPhone || normalizedPhone)}</strong></div>
              <div class="line"><span>Codigo</span><strong>${order.trackingCode}</strong></div>
            </div>

            ${
              order.paymentMethod || order.paymentNotes
                ? `
            <div class="section">
              <div class="label">Pagamento</div>
              ${
                order.paymentMethod
                  ? `<div class="line"><span>Forma</span><strong>${PAYMENT_METHOD_LABEL[order.paymentMethod] || order.paymentMethod}</strong></div>`
                  : ""
              }
              ${
                order.paymentNotes
                  ? `<p class="meta">${order.paymentNotes}</p>`
                  : ""
              }
            </div>
            `
                : ""
            }

            <div class="section">
              <div class="label">Pedido</div>
              ${itemsMarkup}
            </div>

            ${
              order.notes
                ? `<div class="section"><div class="label">Observacoes</div><p class="meta">${order.notes}</p></div>`
                : ""
            }

            <div class="total">
              <span>Total</span>
              <span>${formatPrice(order.total)}</span>
            </div>

            <div class="footer">
              Acompanhe seu pedido pelo telefone informado no checkout.
            </div>
          </div>
          <script>
            window.onload = () => {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    receiptWindow.document.close();
  };

  return (
    <Card className="border-border/70 bg-card/90 shadow-[0_20px_50px_rgba(0,0,0,0.14)]">
      <CardHeader className="space-y-2">
        <CardTitle className="text-lg">Acompanhe seu pedido</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          value={customerPhone}
          onChange={(event) => setCustomerPhone(event.target.value)}
          placeholder="Digite seu numero de telefone"
          inputMode="tel"
        />

        {customerPhone.length > 0 && normalizedPhone.length < 10 ? (
          <div className="rounded-2xl border border-accent/25 bg-accent/8 p-3 text-sm text-muted-foreground">
            Digite o telefone com DDD usado no pedido para liberar o acompanhamento.
          </div>
        ) : null}

        {trackQuery.isLoading ? (
          <div className="rounded-2xl border border-border/70 bg-background/45 p-4 text-sm text-muted-foreground">
            Buscando pedido...
          </div>
        ) : order ? (
          <div className="space-y-3 rounded-2xl border border-border/70 bg-background/45 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-semibold text-foreground">
                {order.customerName}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-accent/14 px-3 py-1 text-xs font-semibold text-accent">
                  {STATUS_LABEL[order.status] || order.status}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handlePrintReceipt}
                >
                  <Printer className="h-4 w-4" />
                  Notinha
                </Button>
              </div>
            </div>

            {order.status === "cancelled" || order.status === "delivered" ? (
              <div
                className={`rounded-2xl border p-4 text-sm ${
                  order.status === "cancelled"
                    ? "border-destructive/30 bg-destructive/10 text-destructive"
                    : "border-emerald-500/30 bg-emerald-500/10 text-foreground"
                }`}
              >
                <p className="font-semibold">
                  {order.status === "cancelled"
                    ? "Pedido cancelado"
                    : "Pedido concluido com sucesso"}
                </p>
                <p className="mt-1">
                  {order.status === "cancelled"
                    ? "Esse pedido foi cancelado pela equipe."
                    : "Esse pedido ja foi finalizado e nao aparece mais como pedido em andamento."}
                </p>
              </div>
            ) : (
              <div className="space-y-4 rounded-2xl border border-border/70 bg-card/70 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">
                    Andamento do pedido
                  </p>
                  <span className="text-xs uppercase tracking-[0.2em] text-accent/90">
                    Atualizado agora
                  </span>
                </div>

                <div className="order-progress">
                  {TRACK_STEPS.map((step, index) => {
                    const isCompleted = currentStepIndex >= index;
                    const isCurrent = currentStepIndex === index;

                    return (
                      <div
                        key={step.key}
                        className={`order-progress-step ${
                          isCompleted ? "is-complete" : ""
                        } ${isCurrent ? "is-current" : ""}`}
                      >
                        <div className="order-progress-dot">
                          {isCurrent ? (
                            <img
                              src={restaurantLogo}
                              alt="Fogareiro"
                              className="order-progress-logo"
                            />
                          ) : null}
                        </div>
                        <span>{step.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="text-sm text-muted-foreground">
              <p>Codigo: {order.trackingCode}</p>
              <p>Status final: {STATUS_LABEL[order.status] || order.status}</p>
              {order.paymentMethod ? (
                <p>Pagamento: {PAYMENT_METHOD_LABEL[order.paymentMethod] || order.paymentMethod}</p>
              ) : null}
              {order.paymentNotes ? <p>Obs. pagamento: {order.paymentNotes}</p> : null}
              {order.items.length > 0 ? (
                <div className="mt-3 space-y-2">
                  <p className="text-xs uppercase tracking-[0.2em] text-accent/90">
                    Itens do pedido
                  </p>
                  <div className="space-y-2">
                    {order.items.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-border/60 bg-card/55 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-foreground">
                              {item.quantity}x {item.productName}
                            </p>
                            {item.customization && item.customization !== "completo" ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                Tipo: {item.customization}
                              </p>
                            ) : null}
                            {item.observations ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                Obs: {item.observations}
                              </p>
                            ) : null}
                          </div>
                          <span className="font-semibold text-foreground">
                            {formatPrice(item.totalPrice)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {order.status === "cancelled" || order.status === "delivered" ? (
                <p className="mt-2">
                  Resumo final disponivel para consulta. Quando houver um novo pedido ativo, ele passa a aparecer aqui automaticamente.
                </p>
              ) : order.estimatedReadyMinutes ? (
                <div className="mt-3 space-y-3 rounded-2xl border border-border/60 bg-card/55 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="flex items-center gap-2 text-foreground">
                      <Clock3 className="h-4 w-4 text-accent" />
                      Tempo estimado: {order.estimatedReadyMinutes} minutos
                    </p>
                    {estimatedProgress ? (
                      <span
                        className={`text-sm font-semibold ${
                          estimatedProgress.isLate ? "text-destructive" : "text-accent"
                        }`}
                      >
                        {estimatedProgress.isLate
                          ? "Prazo excedido"
                          : `${estimatedProgress.remainingMinutes}m ${estimatedProgress.remainingSeconds}s restantes`}
                      </span>
                    ) : null}
                  </div>

                  {estimatedProgress ? (
                    <>
                      <div className="order-timer-bar">
                        <span
                          style={{ width: `${estimatedProgress.isLate ? 100 : estimatedProgress.progress}%` }}
                          className={estimatedProgress.isLate ? "is-late" : ""}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span>Inicio do preparo</span>
                        <span>
                          {estimatedProgress.isLate
                            ? `${estimatedProgress.elapsedMinutes} min decorridos`
                            : `${Math.round(estimatedProgress.progress)}% do prazo consumido`}
                        </span>
                        <span>Previsao final</span>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2">Tempo estimado ainda nao informado pela cozinha.</p>
              )}
            </div>
          </div>
        ) : normalizedPhone.length >= 10 ? (
          <div className="rounded-2xl border border-border/70 bg-background/45 p-4 text-sm text-muted-foreground">
            Nenhum pedido encontrado com esse telefone.
          </div>
        ) : normalizedPhone.length > 0 ? (
          <div className="rounded-2xl border border-border/70 bg-background/45 p-4 text-sm text-muted-foreground">
            Digite o telefone informado no checkout.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
