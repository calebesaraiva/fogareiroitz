import { useAuth } from "@/_core/hooks/useAuth";
import RestaurantHeader from "@/components/RestaurantHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useGlobalLoading } from "@/contexts/GlobalLoadingContext";
import { trpc } from "@/lib/trpc";
import {
  BellRing,
  ChefHat,
  Clock3,
  Edit2,
  LogOut,
  PackageCheck,
  Plus,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type KitchenOrder = {
  id: number;
  trackingCode: string;
  customerName: string;
  customerPhone: string | null;
  orderType: "dine_in" | "takeaway" | "reservation";
  status: "pending" | "new" | "preparing" | "ready" | "delivered" | "cancelled";
  tableNumber: number | null;
  tableLabel: string | null;
  estimatedReadyMinutes: number | null;
  guestCount: number | null;
  notes: string | null;
  total: number;
  createdAt: Date;
  items: Array<{
    id: number;
    productId?: number | null;
    productName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    customization: string | null;
    observations: string | null;
  }>;
};

type ProductOption = {
  id: number;
  name: string;
  price: number;
  categoryName: string | null;
};

type OrderStatus = KitchenOrder["status"];

type DraftItem = {
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  customization?: string | null;
  observations?: string | null;
  imageUrl?: string | null;
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Aguardando aprovacao",
  new: "Aprovado",
  preparing: "Em preparo",
  ready: "Pronto",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

const STATUS_FLOW: OrderStatus[] = ["pending", "new", "preparing", "ready", "delivered"];
const ACTIVE_FLOW: OrderStatus[] = ["new", "preparing", "ready", "delivered"];

const canAccessKitchenPanel = (role?: string | null) =>
  role === "kitchen" || role === "waiter";

const playAlertTone = () => {
  try {
    const audioContext = new window.AudioContext();
    const gain = audioContext.createGain();
    const oscillatorA = audioContext.createOscillator();
    const oscillatorB = audioContext.createOscillator();

    oscillatorA.type = "square";
    oscillatorB.type = "sawtooth";
    oscillatorA.frequency.setValueAtTime(1180, audioContext.currentTime);
    oscillatorB.frequency.setValueAtTime(840, audioContext.currentTime + 0.12);

    gain.gain.setValueAtTime(0.001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, audioContext.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.48);

    oscillatorA.connect(gain);
    oscillatorB.connect(gain);
    gain.connect(audioContext.destination);

    oscillatorA.start();
    oscillatorB.start(audioContext.currentTime + 0.08);
    oscillatorA.stop(audioContext.currentTime + 0.34);
    oscillatorB.stop(audioContext.currentTime + 0.5);
  } catch {
    // Browsers may block sound until user interaction.
  }
};

const createLoopingAlert = () => {
  let timer: number | null = null;

  return {
    start() {
      if (timer !== null) return;
      playAlertTone();
      timer = window.setInterval(() => {
        playAlertTone();
      }, 1200);
    },
    stop() {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    },
  };
};

export default function KitchenPanel() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const { pulseLoading, withLoading } = useGlobalLoading();
  const [, setLocation] = useLocation();
  const canAccess = canAccessKitchenPanel(user?.role);
  const canCreateInternal = user?.role === "waiter";
  const isWaiterView = user?.role === "waiter";

  const ordersQuery = trpc.orders.kitchen.useQuery(undefined, {
    enabled: isAuthenticated && canAccess,
    refetchInterval: 4000,
  });
  const productsQuery = trpc.products.list.useQuery(undefined, {
    enabled: canCreateInternal,
  });
  const updateStatusMutation = trpc.orders.updateStatus.useMutation();
  const createInternalMutation = trpc.orders.createInternal.useMutation();
  const updateDetailsMutation = trpc.orders.updateDetails.useMutation();
  const tablesQuery = trpc.tables.list.useQuery(undefined, {
    enabled: canCreateInternal,
  });

  const [isFinishedModalOpen, setIsFinishedModalOpen] = useState(false);
  const [isEditOrderOpen, setIsEditOrderOpen] = useState(false);
  const previousPendingIdsRef = useRef<number[]>([]);
  const previousOverdueIdsRef = useRef<number[]>([]);
  const pendingAlertRef = useRef<ReturnType<typeof createLoopingAlert> | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [selectedTableId, setSelectedTableId] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [draftQuantity, setDraftQuantity] = useState("1");
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [editingOrder, setEditingOrder] = useState<KitchenOrder | null>(null);
  const [editCustomerName, setEditCustomerName] = useState("");
  const [editCustomerPhone, setEditCustomerPhone] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editSelectedProductId, setEditSelectedProductId] = useState("");
  const [editDraftQuantity, setEditDraftQuantity] = useState("1");
  const [editDraftItems, setEditDraftItems] = useState<DraftItem[]>([]);
  const [estimateByOrderId, setEstimateByOrderId] = useState<Record<number, string>>({});
  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [loading, isAuthenticated, setLocation]);

  useEffect(() => {
    if (!loading && isAuthenticated && !canAccessKitchenPanel(user?.role)) {
      setLocation("/login");
    }
  }, [loading, isAuthenticated, user, setLocation]);

  const orders = useMemo(
    () =>
      ((ordersQuery.data ?? []) as KitchenOrder[]).map((order) => ({
        ...order,
        id: Number(order.id),
        tableNumber:
          order.tableNumber === null || order.tableNumber === undefined
            ? null
            : Number(order.tableNumber),
        estimatedReadyMinutes:
          order.estimatedReadyMinutes === null || order.estimatedReadyMinutes === undefined
            ? null
            : Number(order.estimatedReadyMinutes),
        items: order.items.map((item) => ({
          ...item,
          id: Number(item.id),
          productId:
            item.productId === null || item.productId === undefined
              ? null
              : Number(item.productId),
        })),
      })),
    [ordersQuery.data]
  );

  const products = useMemo(
    () =>
      ((productsQuery.data ?? []) as ProductOption[]).map((product) => ({
        ...product,
        id: Number(product.id),
        price: Number(product.price),
      })),
    [productsQuery.data]
  );

  useEffect(() => {
    pendingAlertRef.current = createLoopingAlert();
    return () => {
      pendingAlertRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTs(Date.now());
    }, 30000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const pendingIds = orders
      .filter((order) => order.status === "pending")
      .map((order) => order.id);
    const overdueIds = orders
      .filter((order) => {
        if (
          order.status === "cancelled" ||
          order.status === "delivered" ||
          order.status === "ready" ||
          !order.estimatedReadyMinutes
        ) {
          return false;
        }

        const createdAt = new Date(order.createdAt).getTime();
        const dueAt = createdAt + order.estimatedReadyMinutes * 60_000;
        return dueAt <= nowTs;
      })
      .map((order) => order.id);
    const previousIds = previousPendingIdsRef.current;
    const previousOverdueIds = previousOverdueIdsRef.current;
    const hasNewPending = pendingIds.some((id) => !previousIds.includes(id));
    const hasNewOverdue = overdueIds.some((id) => !previousOverdueIds.includes(id));

    if (previousIds.length > 0 && hasNewPending) {
      toast.success("Novo pedido aguardando aprovacao", {
        description: "Admin e cozinha podem aceitar esse pedido agora.",
      });
    }

    if (previousOverdueIds.length > 0 && hasNewOverdue) {
      toast.error("Pedido atrasado na cozinha", {
        description: "O prazo de preparo estourou e exige atencao imediata.",
      });
    }

    if (pendingIds.length > 0 || overdueIds.length > 0) {
      pendingAlertRef.current?.start();
    } else {
      pendingAlertRef.current?.stop();
    }

    previousPendingIdsRef.current = pendingIds;
    previousOverdueIdsRef.current = overdueIds;
  }, [nowTs, orders]);

  const stats = useMemo(() => {
    const countByStatus = orders.reduce<Record<OrderStatus, number>>(
      (acc, order) => {
        acc[order.status] += 1;
        return acc;
      },
      {
        pending: 0,
        new: 0,
        preparing: 0,
        ready: 0,
        delivered: 0,
        cancelled: 0,
      }
    );

    return {
      totalOpen:
        countByStatus.pending +
        countByStatus.new +
        countByStatus.preparing +
        countByStatus.ready,
      pendingOrders: countByStatus.pending,
      newOrders: countByStatus.new,
      preparingOrders: countByStatus.preparing,
      readyOrders: countByStatus.ready,
      finishedOrders: countByStatus.delivered + countByStatus.cancelled,
    };
  }, [orders]);

  const pendingQueue = useMemo(
    () =>
      orders
        .filter((order) => order.status === "pending")
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    [orders]
  );

  const activeQueue = useMemo(() => {
    const rank: Record<Exclude<OrderStatus, "pending" | "delivered" | "cancelled">, number> = {
      new: 0,
      preparing: 1,
      ready: 2,
    };

    return orders
      .filter((order) => order.status === "new" || order.status === "preparing" || order.status === "ready")
      .sort((a, b) => {
        const aRank = rank[a.status as keyof typeof rank] ?? 99;
        const bRank = rank[b.status as keyof typeof rank] ?? 99;
        if (aRank !== bRank) return aRank - bRank;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
  }, [orders]);

  const finishedQueue = useMemo(
    () =>
      orders
        .filter((order) => order.status === "delivered" || order.status === "cancelled")
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    [orders]
  );

  const internalTotal = useMemo(
    () => draftItems.reduce((sum, item) => sum + item.totalPrice, 0),
    [draftItems]
  );

  const editOrderTotal = useMemo(
    () => editDraftItems.reduce((sum, item) => sum + item.totalPrice, 0),
    [editDraftItems]
  );

  const kitchenNotices = useMemo(() => {
    const notices: Array<{
      orderId: number;
      tone: "danger" | "warning" | "info" | "success";
      title: string;
      detail: string;
    }> = [];

    orders.forEach((order) => {
      if (order.status === "pending") {
        notices.push({
          orderId: order.id,
          tone: "warning",
          title: `Pedido #${order.id} aguardando aceite`,
          detail: "Aceite ou recuse para liberar a fila da cozinha.",
        });
        return;
      }

      if (
        order.status !== "cancelled" &&
        order.status !== "delivered" &&
        order.estimatedReadyMinutes
      ) {
        const createdAt = new Date(order.createdAt).getTime();
        const dueAt = createdAt + order.estimatedReadyMinutes * 60_000;
        const diffMinutes = Math.round((dueAt - nowTs) / 60000);

        if (order.status === "ready") {
          notices.push({
            orderId: order.id,
            tone: "success",
            title: `Pedido #${order.id} pronto para entrega`,
            detail: "Avise o atendimento ou finalize como entregue quando sair.",
          });
          return;
        }

        if (diffMinutes <= 0) {
          notices.push({
            orderId: order.id,
            tone: "danger",
            title: `Pedido #${order.id} atrasado`,
            detail: `O prazo informado passou ${Math.abs(diffMinutes)} min atras.`,
          });
          return;
        }

        if (diffMinutes <= 5) {
          notices.push({
            orderId: order.id,
            tone: "warning",
            title: `Pedido #${order.id} perto do prazo`,
            detail: `Faltam cerca de ${diffMinutes} min para o prazo prometido.`,
          });
          return;
        }

        notices.push({
          orderId: order.id,
          tone: "info",
          title: `Pedido #${order.id} dentro do prazo`,
          detail: `Status atual: ${STATUS_LABEL[order.status]}. Restam ${diffMinutes} min.`,
        });
      }
    });

    return notices.sort((a, b) => {
      const priority = { danger: 0, warning: 1, info: 2, success: 3 };
      return priority[a.tone] - priority[b.tone];
    });
  }, [nowTs, orders]);

  const formatPrice = (price: number) =>
    (price / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  const formatDateTime = (date: Date | null) => {
    if (!date) return null;
    return new Date(date).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  };

  const getRemainingLabel = (order: KitchenOrder) => {
    if (!order.estimatedReadyMinutes) return null;
    const createdAt = new Date(order.createdAt).getTime();
    const dueAt = createdAt + order.estimatedReadyMinutes * 60_000;
    const diffMinutes = Math.round((dueAt - nowTs) / 60000);

    if (order.status === "ready") return "Pedido pronto para sair";
    if (diffMinutes < 0) return `${Math.abs(diffMinutes)} min de atraso`;
    if (diffMinutes === 0) return "Prazo no limite";
    return `${diffMinutes} min restantes`;
  };

  const handleStatusChange = async (
    orderId: number,
    status: OrderStatus,
    estimatedReadyMinutes?: number | null
  ) => {
    try {
      await withLoading(
        () =>
          updateStatusMutation.mutateAsync({
            id: orderId,
            status,
            estimatedReadyMinutes,
          }),
        { message: `Atualizando pedido para ${STATUS_LABEL[status]}` }
      );
      await ordersQuery.refetch();
      toast.success(`Pedido atualizado para "${STATUS_LABEL[status]}"`);
    } catch (error) {
      console.error(error);
      toast.error("Nao foi possivel atualizar o status do pedido");
    }
  };

  const handleAcceptOrder = async (orderId: number) => {
    const estimate = Math.max(1, Number(estimateByOrderId[orderId] || "20") || 20);
    await handleStatusChange(orderId, "new", estimate);
  };

  const addDraftItem = () => {
    const product = products.find((item) => item.id === Number(selectedProductId));
    const quantity = Math.max(1, Number(draftQuantity) || 1);

    if (!product) {
      toast.error("Selecione um item do cardapio para adicionar");
      return;
    }

    setDraftItems((current) => {
      const existing = current.find((item) => item.productId === product.id);
      if (existing) {
        return current.map((item) =>
          item.productId === product.id
            ? {
                ...item,
                quantity: item.quantity + quantity,
                totalPrice: item.unitPrice * (item.quantity + quantity),
              }
            : item
        );
      }

      return [
        ...current,
        {
          productId: product.id,
          productName: product.name,
          quantity,
          unitPrice: product.price,
          totalPrice: product.price * quantity,
        },
      ];
    });

    setSelectedProductId("");
    setDraftQuantity("1");
  };

  const removeDraftItem = (productId: number) => {
    setDraftItems((current) => current.filter((item) => item.productId !== productId));
  };

  const openEditOrder = (order: KitchenOrder) => {
    setEditingOrder(order);
    setEditCustomerName(order.customerName);
    setEditCustomerPhone(order.customerPhone ?? "");
    setEditNotes(order.notes ?? "");
    setEditSelectedProductId("");
    setEditDraftQuantity("1");
    setEditDraftItems(
      order.items.map((item) => ({
        productId: item.productId ?? -item.id,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        customization: item.customization,
        observations: item.observations,
      }))
    );
    setIsEditOrderOpen(true);
  };

  const closeEditOrder = () => {
    setIsEditOrderOpen(false);
    setEditingOrder(null);
    setEditCustomerName("");
    setEditCustomerPhone("");
    setEditNotes("");
    setEditSelectedProductId("");
    setEditDraftQuantity("1");
    setEditDraftItems([]);
  };

  const addEditDraftItem = () => {
    const product = products.find((item) => item.id === Number(editSelectedProductId));
    const quantity = Math.max(1, Number(editDraftQuantity) || 1);

    if (!product) {
      toast.error("Selecione um item do cardapio para adicionar");
      return;
    }

    setEditDraftItems((current) => {
      const existing = current.find((item) => item.productId === product.id);
      if (existing) {
        return current.map((item) =>
          item.productId === product.id
            ? {
                ...item,
                quantity: item.quantity + quantity,
                totalPrice: item.unitPrice * (item.quantity + quantity),
              }
            : item
        );
      }

      return [
        ...current,
        {
          productId: product.id,
          productName: product.name,
          quantity,
          unitPrice: product.price,
          totalPrice: product.price * quantity,
        },
      ];
    });

    setEditSelectedProductId("");
    setEditDraftQuantity("1");
  };

  const updateEditDraftQuantity = (productId: number, quantity: number) => {
    if (quantity <= 0) {
      setEditDraftItems((current) => current.filter((item) => item.productId !== productId));
      return;
    }

    setEditDraftItems((current) =>
      current.map((item) =>
        item.productId === productId
          ? {
              ...item,
              quantity,
              totalPrice: item.unitPrice * quantity,
            }
          : item
      )
    );
  };

  const removeEditDraftItem = (productId: number) => {
    setEditDraftItems((current) => current.filter((item) => item.productId !== productId));
  };

  const resetInternalOrderForm = () => {
    setCustomerName("");
    setCustomerPhone("");
    setSelectedTableId("");
    setNotes("");
    setSelectedProductId("");
    setDraftQuantity("1");
    setDraftItems([]);
  };

  const handleCreateInternalOrder = async (event: FormEvent) => {
    event.preventDefault();

    if (!canCreateInternal) {
      toast.error("Apenas o garcom pode abrir pedido presencial manual");
      return;
    }

    if (!customerName.trim()) {
      toast.error("Informe o nome para identificar o pedido");
      return;
    }

    if (draftItems.length === 0) {
      toast.error("Adicione pelo menos um item ao pedido interno");
      return;
    }

    if (!selectedTableId) {
      toast.error("Selecione a mesa do atendimento presencial");
      return;
    }

    if (customerPhone.replace(/\D/g, "").length < 10) {
      toast.error("Informe o telefone do cliente com DDD");
      return;
    }

    try {
      await withLoading(
        () =>
          createInternalMutation.mutateAsync({
            customerName: customerName.trim(),
            customerPhone: customerPhone.trim(),
            tableId: Number(selectedTableId),
            notes: notes.trim() || undefined,
            total: internalTotal,
            items: draftItems.map((item) => ({
              productId: item.productId,
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
            })),
          }),
        { message: "Criando pedido interno da cozinha", minDurationMs: 1100 }
      );

      resetInternalOrderForm();
      await ordersQuery.refetch();
      toast.success("Pedido presencial criado sem etapa de aprovacao");
    } catch (error) {
      console.error(error);
      toast.error("Nao foi possivel criar o pedido interno");
    }
  };

  const handleSaveEditedOrder = async (event: FormEvent) => {
    event.preventDefault();

    if (!editingOrder) return;

    if (!editCustomerName.trim()) {
      toast.error("Informe o nome do cliente");
      return;
    }

    if (editCustomerPhone.replace(/\D/g, "").length < 10) {
      toast.error("Informe o telefone do cliente com DDD");
      return;
    }

    if (editDraftItems.length === 0) {
      toast.error("O pedido precisa ter pelo menos um item");
      return;
    }

    try {
      await withLoading(
        () =>
          updateDetailsMutation.mutateAsync({
            id: Number(editingOrder.id),
            customerName: editCustomerName.trim(),
            customerPhone: editCustomerPhone.trim(),
            notes: editNotes.trim() || undefined,
            total: editOrderTotal,
            items: editDraftItems.map((item) => ({
              productId: item.productId > 0 ? item.productId : null,
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
              imageUrl: item.imageUrl ?? null,
              customization: item.customization ?? null,
              observations: item.observations ?? null,
            })),
          }),
        { message: `Salvando alteracoes do pedido #${editingOrder.id}` }
      );

      await ordersQuery.refetch();
      closeEditOrder();
      toast.success("Pedido atualizado com sucesso");
    } catch (error) {
      console.error(error);
      toast.error("Nao foi possivel atualizar esse pedido");
    }
  };

  const handleLogout = async () => {
    await logout();
    await pulseLoading("Saindo do painel da cozinha", 950);
    setLocation("/");
  };

  const jumpToOrder = (orderId: number) => {
    const element = document.getElementById(`kitchen-order-${orderId}`);
    if (!element) return;

    element.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-accent border-t-transparent" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !canAccess) {
    return null;
  }

  const getOrderToneClass = (status: OrderStatus) => {
    if (status === "pending") {
      return "ring-1 ring-accent/35 shadow-[0_0_0_1px_rgba(255,171,60,0.22),0_24px_60px_rgba(255,120,0,0.12)]";
    }
    if (status === "new") {
      return "border-sky-300/20 bg-[linear-gradient(180deg,rgba(45,27,34,0.96),rgba(28,18,23,0.98))] ring-1 ring-sky-300/15";
    }
    if (status === "preparing") {
      return "border-amber-300/20 bg-[linear-gradient(180deg,rgba(52,29,27,0.96),rgba(30,18,20,0.98))] ring-1 ring-amber-300/15";
    }
    if (status === "ready") {
      return "border-emerald-400/25 bg-[linear-gradient(180deg,rgba(26,44,35,0.92),rgba(22,28,25,0.98))] ring-1 ring-emerald-400/20";
    }
    if (status === "cancelled") {
      return "border-destructive/20 bg-[linear-gradient(180deg,rgba(52,23,29,0.95),rgba(33,16,21,0.98))]";
    }
    return "border-border/80 bg-card/95";
  };

  const renderOrderCard = (order: KitchenOrder) => (
    <Card
      key={order.id}
      id={`kitchen-order-${order.id}`}
      className={`overflow-hidden scroll-mt-28 ${getOrderToneClass(order.status)}`}
    >
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Pedido #{order.id}</Badge>
              <Badge variant="outline">Consumir no local</Badge>
              <Badge>{STATUS_LABEL[order.status]}</Badge>
              {order.status === "pending" && (
                <Badge className="bg-accent text-accent-foreground">Precisa aceitar</Badge>
              )}
            </div>
            <CardTitle className="text-lg sm:text-xl">{order.customerName}</CardTitle>
            <div className="space-y-1 text-sm text-muted-foreground">
              {order.tableNumber && <p>Mesa {order.tableNumber}</p>}
              {order.customerPhone && <p>Telefone: {order.customerPhone}</p>}
              {order.guestCount && <p>Pessoas: {order.guestCount}</p>}
              <p>Codigo: {order.trackingCode}</p>
              {order.estimatedReadyMinutes ? <p>Previsao: {order.estimatedReadyMinutes} min</p> : null}
              {getRemainingLabel(order) ? (
                <p className="font-medium text-foreground">Andamento do prazo: {getRemainingLabel(order)}</p>
              ) : null}
            </div>
          </div>

          <div className="text-left text-sm text-muted-foreground sm:text-right">
            <div className="flex items-center gap-2 sm:justify-end">
              <Clock3 className="h-4 w-4 text-accent" />
              {formatDateTime(order.createdAt)}
            </div>
            <p className="mt-2 text-xl font-bold text-accent">{formatPrice(order.total)}</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="rounded-2xl border border-border/70 bg-muted/60 p-4">
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Itens do pedido</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {order.items.length} item(ns) pedidos pelo cliente
              </p>
            </div>
            <span className="rounded-full bg-background/70 px-3 py-1 text-xs font-semibold text-foreground">
              {order.items.reduce((sum, item) => sum + item.quantity, 0)} volume
            </span>
          </div>

          {order.items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 bg-background/35 p-3 text-sm text-muted-foreground">
              Nenhum item detalhado encontrado nesse pedido.
            </div>
          ) : (
            <div className="space-y-3">
              {order.items.map((item) => (
                <div key={item.id} className="rounded-xl border border-border/60 bg-background/40 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground">
                        {item.quantity}x {item.productName}
                      </p>
                      {item.customization && item.customization !== "completo" && (
                        <p className="mt-1 text-sm text-muted-foreground">Tipo de preparo: {item.customization}</p>
                      )}
                      {item.observations && (
                        <div className="mt-2 rounded-lg border border-border/50 bg-card/55 px-3 py-2">
                          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                            Observacao do item
                          </p>
                          <p className="mt-1 text-sm text-foreground">{item.observations}</p>
                        </div>
                      )}
                    </div>

                    <div className="text-left sm:text-right">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Total</p>
                      <p className="mt-1 font-semibold text-accent">{formatPrice(item.totalPrice)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {order.notes && (
          <div className="rounded-xl border border-border/70 bg-background/50 p-3">
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Observacoes gerais</p>
            <p className="mt-2 text-sm text-foreground">{order.notes}</p>
          </div>
        )}

        {order.status === "pending" ? (
          <div className="space-y-3">
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              onClick={() => openEditOrder(order)}
              disabled={updateDetailsMutation.isPending}
            >
              <Edit2 className="h-4 w-4" />
              Editar pedido
            </Button>
            <div>
              <label className="mb-2 block text-sm font-semibold">Tempo estimado de espera</label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="1"
                  max="240"
                  value={estimateByOrderId[order.id] ?? "20"}
                  onChange={(event) =>
                    setEstimateByOrderId((current) => ({
                      ...current,
                      [order.id]: event.target.value,
                    }))
                  }
                  className="max-w-28"
                />
                <span className="flex items-center text-sm text-muted-foreground">minutos</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                type="button"
                className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
                onClick={() => handleAcceptOrder(order.id)}
                disabled={updateStatusMutation.isPending}
              >
                <ShieldCheck className="h-4 w-4" />
                Aceitar pedido
              </Button>
              <Button
                type="button"
                variant="outline"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => handleStatusChange(order.id, "cancelled", null)}
                disabled={updateStatusMutation.isPending}
              >
                Recusar pedido
              </Button>
            </div>
          </div>
        ) : order.status === "delivered" || order.status === "cancelled" ? null : (
          <>
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              onClick={() => openEditOrder(order)}
              disabled={updateDetailsMutation.isPending}
            >
              <Edit2 className="h-4 w-4" />
              Editar pedido
            </Button>

            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {ACTIVE_FLOW.map((status) => (
                <Button
                  key={status}
                  type="button"
                  variant={order.status === status ? "default" : "outline"}
                  className={order.status === status ? "bg-accent text-accent-foreground" : ""}
                  onClick={() => handleStatusChange(order.id, status)}
                  disabled={updateStatusMutation.isPending}
                >
                  {STATUS_LABEL[status]}
                </Button>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full text-destructive hover:bg-destructive/10"
              onClick={() => handleStatusChange(order.id, "cancelled")}
              disabled={updateStatusMutation.isPending}
            >
              Cancelar pedido
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="mothers-day-shell min-h-screen">
      <RestaurantHeader
        showCart={false}
        title={isWaiterView ? "Painel do Garcom" : "Painel da Cozinha"}
        subtitle={
          isWaiterView
            ? "Abrir pedidos presenciais, ajustar comandas e acompanhar a fila em tempo real"
            : "Pedidos aguardando aprovacao e fila de preparo em tempo real"
        }
      />

      <div className="border-b border-border bg-card/90">
        <div className="container mx-auto flex flex-col gap-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2 rounded-full bg-background/60 px-3 py-1">
              <BellRing className="h-4 w-4 text-accent" />
              {stats.pendingOrders} aguardando aprovacao
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-background/60 px-3 py-1">
              <ChefHat className="h-4 w-4 text-accent" />
              {orders.length} pedido(s) ativos
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => ordersQuery.refetch()} className="gap-2">
              <RefreshCcw className="h-4 w-4" />
              Atualizar
            </Button>
            <Button variant="outline" onClick={handleLogout} className="gap-2">
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </div>

      <main className="container mx-auto space-y-6 py-6 md:space-y-8 md:py-8">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Card className="fogareiro-admin-metric border-border/70 bg-card/90">
            <CardContent className="p-4 sm:p-5">
              <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                Em aberto
              </p>
              <p className="mt-3 text-2xl font-bold text-foreground sm:text-3xl">
                {stats.totalOpen}
              </p>
            </CardContent>
          </Card>
          <Card className="fogareiro-admin-metric border-border/70 bg-card/90 ring-1 ring-accent/20">
            <CardContent className="p-4 sm:p-5">
              <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                Aguardando
              </p>
              <p className="mt-3 text-2xl font-bold text-accent sm:text-3xl">
                {stats.pendingOrders}
              </p>
            </CardContent>
          </Card>
          <Card className="fogareiro-admin-metric border-border/70 bg-card/90">
            <CardContent className="p-4 sm:p-5">
              <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                Aprovados
              </p>
              <p className="mt-3 text-2xl font-bold text-foreground sm:text-3xl">
                {stats.newOrders}
              </p>
            </CardContent>
          </Card>
          <Card className="fogareiro-admin-metric border-border/70 bg-card/90">
            <CardContent className="p-4 sm:p-5">
              <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                Em preparo
              </p>
              <p className="mt-3 text-2xl font-bold text-foreground sm:text-3xl">
                {stats.preparingOrders}
              </p>
            </CardContent>
          </Card>
          <Card className="fogareiro-admin-metric col-span-2 border-border/70 bg-card/90 lg:col-span-1">
            <CardContent className="p-4 sm:p-5">
              <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                Prontos
              </p>
              <p className="mt-3 text-2xl font-bold text-foreground sm:text-3xl">
                {stats.readyOrders}
              </p>
            </CardContent>
          </Card>
        </section>

        {stats.pendingOrders > 0 && (
          <section className="rounded-[1.75rem] border border-accent/35 bg-gradient-to-r from-accent/18 via-card/95 to-card/88 p-4 shadow-[0_18px_46px_rgba(0,0,0,0.14)] sm:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <BellRing className="h-4 w-4 text-accent" />
                  Alerta de novos pedidos
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Os pedidos feitos no cardapio chegam aqui e no admin como aguardando aprovacao.
                </p>
              </div>
              <Badge className="w-fit bg-accent text-accent-foreground">
                {stats.pendingOrders} aguardando aceite
              </Badge>
            </div>
          </section>
        )}

        <section className="rounded-[1.75rem] border border-border/70 bg-card/90 p-4 shadow-[0_18px_46px_rgba(0,0,0,0.14)] sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Clock3 className="h-4 w-4 text-accent" />
                Avisos em tempo real da cozinha
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                A fila se atualiza sozinha com prazo, atraso e etapa atual de cada pedido.
              </p>
            </div>
            <Badge variant="outline">{kitchenNotices.length} aviso(s) ativos</Badge>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
            {kitchenNotices.length === 0 ? (
              <div className="rounded-2xl border border-border/70 bg-background/45 p-4 text-sm text-muted-foreground">
                Nenhum aviso critico no momento. Os pedidos ativos seguem dentro do fluxo esperado.
              </div>
            ) : (
              kitchenNotices.map((notice) => (
                <button
                  key={`${notice.orderId}-${notice.title}`}
                  type="button"
                  onClick={() => jumpToOrder(notice.orderId)}
                  className={`rounded-2xl border p-4 text-sm ${
                    notice.tone === "danger"
                      ? "border-destructive/40 bg-destructive/10 text-destructive"
                      : notice.tone === "warning"
                        ? "border-accent/35 bg-accent/10 text-foreground"
                        : notice.tone === "success"
                          ? "border-emerald-500/30 bg-emerald-500/10 text-foreground"
                          : "border-border/70 bg-background/45 text-foreground"
                  } text-left transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(0,0,0,0.14)]`}
                >
                  <p className="font-semibold">{notice.title}</p>
                  <p className="mt-1 text-muted-foreground">{notice.detail}</p>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.95fr)]">
          <div className="space-y-6">
            <section className="rounded-[1.75rem] border border-border/70 bg-card/88 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.18)] backdrop-blur sm:p-5">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <ChefHat className="h-4 w-4 text-accent" />
                    Fila da cozinha
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Pedidos aguardando aceite ficam separados da fila ativa para a operacao ficar mais limpa.
                  </p>
                </div>

                <Button type="button" variant="outline" className="gap-2" onClick={() => setIsFinishedModalOpen(true)}>
                  <PackageCheck className="h-4 w-4" />
                  Finalizados ({stats.finishedOrders})
                </Button>
              </div>

              <div className="space-y-6">
                <div className="rounded-[1.5rem] border border-accent/20 bg-background/25 p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Aguardando aprovacao</p>
                      <p className="text-xs text-muted-foreground">
                        Pedidos que ainda precisam ser aceitos ou recusados.
                      </p>
                    </div>
                    <Badge className="bg-accent text-accent-foreground">{pendingQueue.length}</Badge>
                  </div>

                  {pendingQueue.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/70 bg-background/35 p-4 text-sm text-muted-foreground">
                      Nenhum pedido aguardando aprovacao agora.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-5 2xl:grid-cols-2">
                      {pendingQueue.map(renderOrderCard)}
                    </div>
                  )}
                </div>

                <div className="rounded-[1.5rem] border border-emerald-400/10 bg-background/20 p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Fila ativa</p>
                      <p className="text-xs text-muted-foreground">
                        Pedidos aprovados, em preparo e prontos para sair.
                      </p>
                    </div>
                    <Badge variant="outline">{activeQueue.length} ativos</Badge>
                  </div>

                  {activeQueue.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/70 bg-background/35 p-4 text-sm text-muted-foreground">
                      Nenhum pedido ativo na cozinha no momento.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-5 2xl:grid-cols-2">
                      {activeQueue.map(renderOrderCard)}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>

          <aside className="space-y-6 xl:sticky xl:top-24 xl:self-start">
            <Card className="border-border/70 bg-card/90">
              <CardHeader>
                <CardTitle className="text-lg">
                  {isWaiterView ? "Fluxo do atendimento" : "Fluxo de aceite"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>Pedidos do cardapio entram como aguardando aprovacao.</p>
                <p>Admin e cozinha recebem alerta e podem aceitar o pedido.</p>
                <p>
                  {isWaiterView
                    ? "Voce pode abrir pedido presencial manual, editar a comanda e acompanhar o andamento da cozinha."
                    : "Somente o garcom pode abrir pedido presencial manual, sempre com mesa, nome e telefone."}
                </p>
              </CardContent>
            </Card>

            {canCreateInternal && (
              <Card className="border-border/70 bg-card/92 shadow-[0_24px_60px_rgba(0,0,0,0.18)]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Plus className="h-5 w-5 text-accent" />
                    Novo pedido presencial
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateInternalOrder} className="space-y-4">
                    <div className="grid grid-cols-1 gap-3">
                      <div>
                        <label className="mb-2 block text-sm font-semibold">
                          Nome do cliente ou identificacao
                        </label>
                        <Input
                          value={customerName}
                          onChange={(event) => setCustomerName(event.target.value)}
                          placeholder="Ex: Balcao, Mesa 4, Maria"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold">Mesa</label>
                        <select
                          value={selectedTableId}
                          onChange={(event) => setSelectedTableId(event.target.value)}
                          className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          <option value="">Selecione a mesa</option>
                          {(tablesQuery.data ?? []).map((table) => (
                            <option key={table.id} value={table.id}>
                              Mesa {table.number}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold">Telefone</label>
                        <Input
                          value={customerPhone}
                          onChange={(event) => setCustomerPhone(event.target.value)}
                          placeholder="Obrigatorio para acompanhamento"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold">Observacoes</label>
                        <textarea
                          value={notes}
                          onChange={(event) => setNotes(event.target.value)}
                          rows={3}
                          placeholder="Detalhes do atendimento interno"
                          className="w-full rounded-lg border border-input bg-background p-3 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                        />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border/70 bg-background/35 p-4">
                      <p className="mb-3 text-sm font-semibold text-foreground">
                        Adicionar item
                      </p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_110px]">
                        <select
                          value={selectedProductId}
                          onChange={(event) => setSelectedProductId(event.target.value)}
                          className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          <option value="">Selecione um item do cardapio</option>
                          {products.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name} - {formatPrice(product.price)}
                            </option>
                          ))}
                        </select>
                        <Input
                          type="number"
                          min="1"
                          value={draftQuantity}
                          onChange={(event) => setDraftQuantity(event.target.value)}
                          placeholder="Qtd"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-3 w-full"
                        onClick={addDraftItem}
                      >
                        Adicionar ao pedido
                      </Button>
                    </div>

                    <div className="space-y-3">
                      {draftItems.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                          Nenhum item adicionado ainda.
                        </div>
                      ) : (
                        draftItems.map((item) => (
                          <div
                            key={item.productId}
                            className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-background/45 p-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="font-semibold text-foreground">
                                  {item.quantity}x {item.productName}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {formatPrice(item.unitPrice)} cada
                                </p>
                              </div>
                              <p className="font-semibold text-accent">
                                {formatPrice(item.totalPrice)}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => removeDraftItem(item.productId)}
                            >
                              Remover
                            </Button>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="rounded-2xl bg-muted/55 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-muted-foreground">Total interno</span>
                        <span className="text-xl font-bold text-accent">
                          {formatPrice(internalTotal)}
                        </span>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      disabled={createInternalMutation.isPending}
                      className="w-full gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
                    >
                      <ChefHat className="h-4 w-4" />
                      {createInternalMutation.isPending
                        ? "Criando pedido..."
                        : "Criar pedido interno"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}
          </aside>
        </section>

        <Dialog open={isFinishedModalOpen} onOpenChange={setIsFinishedModalOpen}>
          <DialogContent className="max-h-[calc(100dvh-1rem)] max-w-[min(980px,calc(100vw-1rem))] border-border/70 bg-card/98 sm:max-w-[min(980px,calc(100vw-2rem))]">
            <DialogHeader className="pr-8">
              <DialogTitle>Pedidos finalizados</DialogTitle>
              <DialogDescription>
                Historico de pedidos entregues ou cancelados, mantido fora da fila principal para deixar a operacao mais limpa.
              </DialogDescription>
            </DialogHeader>
            <div className="fogareiro-scrollbar max-h-[calc(100dvh-12rem)] space-y-4 overflow-y-auto pr-2">
              {finishedQueue.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 bg-background/35 p-4 text-sm text-muted-foreground">
                  Nenhum pedido finalizado ainda.
                </div>
              ) : (
                finishedQueue.map(renderOrderCard)
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={isEditOrderOpen} onOpenChange={(open) => (open ? setIsEditOrderOpen(true) : closeEditOrder())}>
          <DialogContent className="max-h-[calc(100dvh-1rem)] max-w-[min(980px,calc(100vw-1rem))] border-border/70 bg-card/98 sm:max-w-[min(980px,calc(100vw-2rem))]">
            <DialogHeader className="pr-8">
              <DialogTitle>
                {editingOrder ? `Editar pedido #${editingOrder.id}` : "Editar pedido"}
              </DialogTitle>
              <DialogDescription>
                Ajuste cliente, observacoes e itens do pedido sem tirar a operacao do ritmo.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveEditedOrder} className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-4">
              <div className="fogareiro-scrollbar grid min-h-0 gap-4 overflow-y-auto pr-2 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-border/70 bg-background/35 p-4">
                    <p className="mb-3 text-sm font-semibold text-foreground">Dados do cliente</p>
                    <div className="space-y-3">
                      <div>
                        <label className="mb-2 block text-sm font-semibold">Nome</label>
                        <Input
                          value={editCustomerName}
                          onChange={(event) => setEditCustomerName(event.target.value)}
                          placeholder="Nome do cliente"
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-semibold">Telefone</label>
                        <Input
                          value={editCustomerPhone}
                          onChange={(event) => setEditCustomerPhone(event.target.value)}
                          placeholder="Telefone com DDD"
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-semibold">Observacoes</label>
                        <textarea
                          value={editNotes}
                          onChange={(event) => setEditNotes(event.target.value)}
                          rows={4}
                          placeholder="Detalhes do pedido"
                          className="w-full rounded-lg border border-input bg-background p-3 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/70 bg-background/35 p-4">
                    <p className="mb-3 text-sm font-semibold text-foreground">Adicionar item</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_110px]">
                      <select
                        value={editSelectedProductId}
                        onChange={(event) => setEditSelectedProductId(event.target.value)}
                        className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">Selecione um item do cardapio</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name} - {formatPrice(product.price)}
                          </option>
                        ))}
                      </select>
                      <Input
                        type="number"
                        min="1"
                        value={editDraftQuantity}
                        onChange={(event) => setEditDraftQuantity(event.target.value)}
                        placeholder="Qtd"
                      />
                    </div>
                    <Button type="button" variant="outline" className="mt-3 w-full" onClick={addEditDraftItem}>
                      Adicionar item
                    </Button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-border/70 bg-background/35 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">Itens do pedido</p>
                      <span className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                        {editDraftItems.length} item(ns)
                      </span>
                    </div>

                    <div className="fogareiro-scrollbar max-h-[24rem] space-y-3 overflow-y-auto pr-1">
                      {editDraftItems.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                          Nenhum item no pedido.
                        </div>
                      ) : (
                        editDraftItems.map((item) => (
                          <div key={`${item.productId}-${item.productName}`} className="rounded-2xl border border-border/70 bg-background/45 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-foreground">{item.productName}</p>
                                <p className="text-sm text-muted-foreground">{formatPrice(item.unitPrice)} cada</p>
                                {item.customization ? (
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
                              <p className="font-semibold text-accent">{formatPrice(item.totalPrice)}</p>
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => updateEditDraftQuantity(item.productId, item.quantity - 1)}
                              >
                                -
                              </Button>
                              <Input
                                type="number"
                                min="1"
                                value={String(item.quantity)}
                                onChange={(event) =>
                                  updateEditDraftQuantity(item.productId, Math.max(1, Number(event.target.value) || 1))
                                }
                                className="w-20"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => updateEditDraftQuantity(item.productId, item.quantity + 1)}
                              >
                                +
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className="ml-auto text-destructive hover:bg-destructive/10"
                                onClick={() => removeEditDraftItem(item.productId)}
                              >
                                Remover
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-muted/55 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-muted-foreground">Total atualizado</span>
                      <span className="text-xl font-bold text-accent">{formatPrice(editOrderTotal)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={closeEditOrder}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="bg-accent text-accent-foreground hover:bg-accent/90"
                  disabled={updateDetailsMutation.isPending}
                >
                  {updateDetailsMutation.isPending ? "Salvando..." : "Salvar alteracoes"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
