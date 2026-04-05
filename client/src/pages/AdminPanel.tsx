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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useGlobalLoading } from "@/contexts/GlobalLoadingContext";
import { trpc } from "@/lib/trpc";
import { jsPDF } from "jspdf";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BellRing,
  Boxes,
  BriefcaseBusiness,
  Copy,
  ClipboardList,
  Download,
  Edit2,
  EyeOff,
  HandPlatter,
  PackageCheck,
  ImagePlus,
  LayoutDashboard,
  LogOut,
  MapPinned,
  MonitorPlay,
  Plus,
  QrCode,
  RefreshCcw,
  Sparkles,
  ShieldCheck,
  Soup,
  Trash2,
  UserPlus2,
  Users2,
  WalletCards,
  XCircle,
} from "lucide-react";
import QRCode from "qrcode";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type Product = {
  id: number;
  categoryId: number | null;
  categoryName: string | null;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  imageFit: string;
  imagePositionX: number;
  imagePositionY: number;
  imageZoom: number;
  imageKey: string | null;
  ingredients: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type OrderSummary = {
  id: number;
  customerName: string;
  status: "pending" | "new" | "preparing" | "ready" | "delivered" | "cancelled";
  orderType: "dine_in" | "takeaway" | "reservation";
  tableId?: number | null;
  total: number;
  createdAt: Date;
};

type CashierOrder = {
  id: number;
  customerName: string;
  customerPhone: string | null;
  tableId: number | null;
  tableNumber: number | null;
  tableLabel: string | null;
  status: "pending" | "new" | "preparing" | "ready" | "delivered" | "cancelled";
  total: number;
  isPaid: boolean;
  serviceFeeDefault: number;
  createdAt: Date;
};

type ProductForm = {
  name: string;
  categoryName: string;
  description: string;
  price: string;
  imageUrl: string;
  imageFit: "cover" | "contain";
  imagePositionX: number;
  imagePositionY: number;
  imageZoom: number;
  ingredients: string;
  isActive: boolean;
};

type LocalUser = {
  id: number;
  name: string | null;
  email: string | null;
  role: "admin" | "kitchen" | "waiter" | "cashier" | "user";
  isActive: boolean;
};

type StaffForm = {
  name: string;
  email: string;
  password: string;
  role: "admin" | "kitchen" | "waiter" | "cashier";
};

type DiningTable = {
  id: number;
  number: number;
  label: string | null;
  publicToken: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type TableForm = {
  number: string;
  label: string;
};

type ShowcaseSlideForm = {
  id: string;
  title: string;
  imageUrl: string;
  durationSeconds: string;
  isActive: boolean;
};

const EMPTY_FORM: ProductForm = {
  name: "",
  categoryName: "",
  description: "",
  price: "",
  imageUrl: "",
  imageFit: "cover",
  imagePositionX: 50,
  imagePositionY: 50,
  imageZoom: 100,
  ingredients: "",
  isActive: true,
};

const EMPTY_STAFF_FORM: StaffForm = {
  name: "",
  email: "",
  password: "",
  role: "waiter",
};

const EMPTY_TABLE_FORM: TableForm = {
  number: "",
  label: "",
};

const EMPTY_SHOWCASE_SLIDE = (): ShowcaseSlideForm => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  title: "",
  imageUrl: "",
  durationSeconds: "6",
  isActive: true,
});

const FALLBACK_PRODUCT_IMAGE =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'><rect width='100%25' height='100%25' fill='%23f3efe8'/><text x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23725a3a' font-family='Arial' font-size='36'>Sem imagem</text></svg>";

const getProductImagePresentation = (product: {
  imageFit: string;
  imagePositionX?: number | null;
  imagePositionY?: number | null;
  imageZoom?: number | null;
}) => {
  const objectFit: "contain" | "cover" = product.imageFit === "contain" ? "contain" : "cover";
  const imagePositionX = Math.max(0, Math.min(100, Number(product.imagePositionX ?? 50)));
  const imagePositionY = Math.max(0, Math.min(100, Number(product.imagePositionY ?? 50)));
  const imageZoom = Math.max(50, Math.min(200, Number(product.imageZoom ?? 100)));

  return {
    className: objectFit === "contain" ? "bg-black/10 p-2" : "",
    style: {
      objectFit,
      objectPosition: `${imagePositionX}% ${imagePositionY}%`,
      transform: `scale(${imageZoom / 100})`,
      transformOrigin: "center center" as const,
    },
  };
};

const ORDER_TYPE_LABEL = "Consumir no local";
const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "Aguardando aprovacao",
  new: "Aceito",
  preparing: "Em preparo",
  ready: "Pronto",
  delivered: "Entregue",
  cancelled: "Cancelado",
  awaiting_payment: "Aguardando pagamento",
  paid: "Pago",
};

export default function AdminPanel() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const { pulseLoading, withLoading } = useGlobalLoading();
  const [, setLocation] = useLocation();

  const productsQuery = trpc.products.listAll.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
  });
  const categoriesQuery = trpc.categories.list.useQuery();
  const ordersQuery = trpc.orders.list.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
    refetchInterval: 5000,
  });
  const cashierQuery = trpc.orders.cashier.useQuery(undefined, {
    enabled: false,
    refetchInterval: 5000,
  });
  const staffQuery = trpc.staff.list.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
  });
  const tablesQuery = trpc.tables.listAll.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
  });
  const settingsQuery = trpc.settings.get.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
  });

  const createMutation = trpc.products.create.useMutation();
  const updateMutation = trpc.products.update.useMutation();
  const deleteMutation = trpc.products.delete.useMutation();
  const createStaffMutation = trpc.staff.create.useMutation();
  const updateStaffMutation = trpc.staff.update.useMutation();
  const createTableMutation = trpc.tables.create.useMutation();
  const updateSettingsMutation = trpc.settings.update.useMutation();

  const [isOpen, setIsOpen] = useState(false);
  const [isCreateStaffOpen, setIsCreateStaffOpen] = useState(false);
  const [isManageStaffOpen, setIsManageStaffOpen] = useState(false);
  const [isCreateTableOpen, setIsCreateTableOpen] = useState(false);
  const [isShowcaseAlbumOpen, setIsShowcaseAlbumOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<ProductForm>(EMPTY_FORM);
  const [staffForm, setStaffForm] = useState<StaffForm>(EMPTY_STAFF_FORM);
  const [tableForm, setTableForm] = useState<TableForm>(EMPTY_TABLE_FORM);
  const [staffPasswordDrafts, setStaffPasswordDrafts] = useState<Record<number, string>>({});
  const [cashierSearch, setCashierSearch] = useState("");
  const [autoPreparingPercent, setAutoPreparingPercent] = useState("15");
  const [autoDeliveredGraceMinutes, setAutoDeliveredGraceMinutes] = useState("8");
  const [showcaseTitle, setShowcaseTitle] = useState("Fogareiro ITZ Restaurante");
  const [showcaseSubtitle, setShowcaseSubtitle] = useState("Cardapio da casa");
  const [showcaseDefaultSeconds, setShowcaseDefaultSeconds] = useState("6");
  const [showcaseSlidesDraft, setShowcaseSlidesDraft] = useState<ShowcaseSlideForm[]>([]);
  const previousPendingOrderIdsRef = useRef<number[]>([]);

  const products = productsQuery.data ?? [];
  const orders = (ordersQuery.data ?? []) as OrderSummary[];
  const cashierOrders = (cashierQuery.data ?? []) as CashierOrder[];
  const localUsers = (staffQuery.data ?? []) as LocalUser[];
  const diningTables = (tablesQuery.data ?? []) as DiningTable[];
  const categorySuggestions = useMemo(
    () => categoriesQuery.data?.map((category) => category.name) ?? [],
    [categoriesQuery.data]
  );

  const stats = useMemo(() => {
    const now = new Date();
    const currentDate = now.getDate();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const activeProducts = products.filter((product) => product.isActive).length;
    const hiddenProducts = products.filter((product) => !product.isActive).length;
    const totalOrders = orders.length;
    const pendingOrders = orders.filter(
      (order) => order.status !== "delivered" && order.status !== "cancelled"
    ).length;
    const waitingApproval = orders.filter((order) => order.status === "pending").length;
    const cancelledOrders = orders.filter((order) => order.status === "cancelled").length;
    const ordersThisMonth = orders.filter((order) => {
      const createdAt = new Date(order.createdAt);
      return (
        createdAt.getMonth() === currentMonth &&
        createdAt.getFullYear() === currentYear
      );
    });
    const monthlyRevenue = ordersThisMonth
      .filter((order) => order.status !== "cancelled")
      .reduce((sum, order) => sum + Number(order.total), 0);
    const monthlyCancelled = ordersThisMonth.filter((order) => order.status === "cancelled").length;
    const deliveredThisMonth = ordersThisMonth.filter(
      (order) => order.status === "delivered" || order.status === "ready"
    ).length;
    const paidOrdersThisMonth = ordersThisMonth.filter((order) => order.status !== "cancelled");
    const averageTicket = paidOrdersThisMonth.length > 0
      ? Math.round(
          paidOrdersThisMonth.reduce((sum, order) => sum + Number(order.total), 0) /
            paidOrdersThisMonth.length
        )
      : 0;
    const ordersToday = orders.filter((order) => {
      const createdAt = new Date(order.createdAt);
      return (
        createdAt.getDate() === currentDate &&
        createdAt.getMonth() === currentMonth &&
        createdAt.getFullYear() === currentYear &&
        order.status !== "cancelled"
      );
    });
    const todayRevenue = ordersToday.reduce((sum, order) => sum + Number(order.total), 0);
    return {
      activeProducts,
      hiddenProducts,
      totalOrders,
      pendingOrders,
      waitingApproval,
      cancelledOrders,
      monthlyRevenue,
      monthlyCancelled,
      deliveredThisMonth,
      averageTicket,
      todayRevenue,
      categories: categorySuggestions.length,
      totalTables: diningTables.length,
    };
  }, [products, orders, categorySuggestions.length, diningTables.length]);

  const occupiedTableIds = useMemo(() => {
    return new Set(
      orders
        .filter((order) => ["pending", "new", "preparing", "ready"].includes(order.status))
        .map((order) => Number((order as OrderSummary & { tableId?: number | null }).tableId))
        .filter((tableId) => Number.isFinite(tableId))
    );
  }, [orders]);

  const tableOrigin = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }, []);

  const filteredCashierOrders = useMemo(() => {
    const query = cashierSearch.trim().toLowerCase();
    const queryDigits = cashierSearch.replace(/\D/g, "");

    if (!query && !queryDigits) return cashierOrders;

    return cashierOrders.filter((order) => {
      const byName = order.customerName.toLowerCase().includes(query);
      const byPhone = queryDigits.length > 0 && (order.customerPhone ?? "").includes(queryDigits);
      const byTableNumber =
        queryDigits.length > 0 &&
        order.tableNumber !== null &&
        String(order.tableNumber).includes(queryDigits);

      return byName || byPhone || byTableNumber;
    });
  }, [cashierOrders, cashierSearch]);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [loading, isAuthenticated, setLocation]);

  useEffect(() => {
    if (!loading && user?.role !== "admin") {
      setLocation("/login");
    }
  }, [loading, user, setLocation]);

  useEffect(() => {
    const pendingIds = orders
      .filter((order) => order.status === "pending")
      .map((order) => order.id);
    const previousIds = previousPendingOrderIdsRef.current;
    const hasNewPending = pendingIds.some((id) => !previousIds.includes(id));

    if (previousIds.length > 0 && hasNewPending) {
      toast.success("Novo pedido aguardando aprovacao no admin", {
        description: "A equipe pode aceitar esse pedido pela cozinha ou acompanhar por aqui.",
      });
    }

    previousPendingOrderIdsRef.current = pendingIds;
  }, [orders]);

  useEffect(() => {
    if (!settingsQuery.data) return;
    setAutoPreparingPercent(String(settingsQuery.data.autoPreparingPercent ?? 15));
    setAutoDeliveredGraceMinutes(String(settingsQuery.data.autoDeliveredGraceMinutes ?? 8));
    setShowcaseTitle(String(settingsQuery.data.showcaseTitle ?? "Fogareiro ITZ Restaurante"));
    setShowcaseSubtitle(String(settingsQuery.data.showcaseSubtitle ?? "Cardapio da casa"));
    setShowcaseDefaultSeconds(String(settingsQuery.data.showcaseSlideSeconds ?? 6));
    const slides = Array.isArray(settingsQuery.data.showcaseSlides)
      ? settingsQuery.data.showcaseSlides.map((slide, index) => ({
          id: String(slide.id ?? `slide-${index + 1}`),
          title: String(slide.title ?? ""),
          imageUrl: String(slide.imageUrl ?? ""),
          durationSeconds: String(slide.durationSeconds ?? settingsQuery.data.showcaseSlideSeconds ?? 6),
          isActive: slide.isActive !== false,
        }))
      : [];
    setShowcaseSlidesDraft(slides);
  }, [settingsQuery.data]);

  const formatPrice = (price: number | string) => {
    const numericPrice = typeof price === "string" ? parseFloat(price || "0") : price / 100;
    return numericPrice.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  const formatPhone = (value: string | null) => {
    const digits = (value ?? "").replace(/\D/g, "");
    if (digits.length === 11) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    }
    return value ?? "-";
  };

  const getTablePublicUrl = (table: Pick<DiningTable, "publicToken">) => {
    const baseOrigin =
      tableOrigin ||
      (typeof window !== "undefined" ? window.location.origin : "");
    return `${baseOrigin}/?mesaToken=${table.publicToken}`;
  };

  const buildTableQrPdf = async (table: DiningTable) => {
    const publicUrl = getTablePublicUrl(table);
    const qrDataUrl = await QRCode.toDataURL(publicUrl, {
      width: 720,
      margin: 1,
      color: {
        dark: "#31161f",
        light: "#fff7f5",
      },
    });

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const cardX = 16;
    const cardY = 16;
    const cardWidth = pageWidth - cardX * 2;
    const cardHeight = pageHeight - cardY * 2;
    const qrSize = 92;
    const qrX = (pageWidth - qrSize) / 2;

    pdf.setFillColor(255, 247, 245);
    pdf.rect(0, 0, pageWidth, pageHeight, "F");
    pdf.setDrawColor(219, 140, 161);
    pdf.setLineWidth(0.8);
    pdf.roundedRect(cardX, cardY, cardWidth, cardHeight, 10, 10, "S");

    pdf.addImage(qrDataUrl, "PNG", qrX, 48, qrSize, qrSize, undefined, "FAST");

    pdf.setTextColor(102, 38, 49);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(24);
    pdf.text(import.meta.env.VITE_APP_TITLE || "Fogareiro ITZ Restaurante", pageWidth / 2, 30, {
      align: "center",
    });

    pdf.setFontSize(12);
    pdf.setFont("helvetica", "normal");
    pdf.text("Especial Dia das Maes", pageWidth / 2, 38, { align: "center" });

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(28);
    pdf.text(`Mesa ${table.number}`, pageWidth / 2, 155, { align: "center" });

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(12);
    pdf.text(table.label || `Mesa ${table.number}`, pageWidth / 2, 164, { align: "center" });

    pdf.setFontSize(11);
    pdf.text(
      "Escaneie este QR Code para abrir o cardapio presencial e registrar o pedido da mesa.",
      pageWidth / 2,
      178,
      { align: "center", maxWidth: 150 }
    );

    pdf.setDrawColor(240, 197, 206);
    pdf.line(32, 190, pageWidth - 32, 190);

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text("Link da mesa", pageWidth / 2, 200, { align: "center" });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(publicUrl, pageWidth / 2, 207, { align: "center", maxWidth: 160 });

    pdf.setFontSize(10);
    pdf.text("Fogareiro ITZ Restaurante", pageWidth / 2, 265, { align: "center" });
    pdf.text("Pedido liberado somente dentro do restaurante.", pageWidth / 2, 271, {
      align: "center",
    });

    pdf.save(`mesa-${table.number}-fogareiro.pdf`);
  };

  const handleOpenDialog = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        categoryName: product.categoryName ?? "",
        description: product.description ?? "",
        price: (product.price / 100).toString(),
        imageUrl: product.imageUrl ?? "",
        imageFit: product.imageFit === "contain" ? "contain" : "cover",
        imagePositionX: Number(product.imagePositionX ?? 50),
        imagePositionY: Number(product.imagePositionY ?? 50),
        imageZoom: Number(product.imageZoom ?? 100),
        ingredients: product.ingredients ?? "",
        isActive: product.isActive,
      });
    } else {
      setEditingProduct(null);
      setFormData(EMPTY_FORM);
    }

    setIsOpen(true);
  };

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        setFormData((current) => ({ ...current, imageUrl: result }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!formData.name.trim() || !formData.price.trim() || !formData.categoryName.trim()) {
      toast.error("Nome, categoria e preco sao obrigatorios");
      return;
    }

    const priceInCents = Math.round(parseFloat(formData.price) * 100);
    if (!Number.isFinite(priceInCents) || priceInCents <= 0) {
      toast.error("Preco invalido", {
        description: "Informe um valor maior que zero.",
      });
      return;
    }

    try {
      const payload = {
        name: formData.name.trim(),
        categoryName: formData.categoryName.trim(),
        description: formData.description.trim() || undefined,
        price: priceInCents,
        imageUrl: formData.imageUrl.trim() || undefined,
        imageFit: formData.imageFit,
        imagePositionX: formData.imagePositionX,
        imagePositionY: formData.imagePositionY,
        imageZoom: formData.imageZoom,
        ingredients: formData.ingredients.trim() || undefined,
        isActive: formData.isActive,
      };

      if (editingProduct) {
        await withLoading(
          () => updateMutation.mutateAsync({ id: Number(editingProduct.id), ...payload }),
          { message: "Salvando produto no cardapio" }
        );
        toast.success("Produto atualizado com sucesso");
      } else {
        await withLoading(() => createMutation.mutateAsync(payload), {
          message: "Criando produto no cardapio",
        });
        toast.success("Produto criado com sucesso");
      }

      setIsOpen(false);
      setEditingProduct(null);
      setFormData(EMPTY_FORM);
      await Promise.all([
        productsQuery.refetch(),
        categoriesQuery.refetch(),
        ordersQuery.refetch(),
      ]);
    } catch (error) {
      console.error(error);
      toast.error("Erro ao salvar produto");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await withLoading(() => deleteMutation.mutateAsync({ id: Number(id) }), {
        message: "Removendo produto do cardapio",
      });
      toast.success("Item removido do cardapio");
      await productsQuery.refetch();
    } catch (error) {
      console.error(error);
      toast.error("Erro ao remover item");
    }
  };

  const handleToggleActive = async (product: Product) => {
    try {
      await withLoading(
        () =>
          updateMutation.mutateAsync({
            id: Number(product.id),
            isActive: !product.isActive,
          }),
        {
          message: product.isActive
            ? "Ocultando item do cardapio"
            : "Reativando item no cardapio",
        }
      );
      toast.success(product.isActive ? "Item ocultado do cardapio" : "Item ativado no cardapio");
      await productsQuery.refetch();
    } catch (error) {
      console.error(error);
      toast.error("Erro ao atualizar status do item");
    }
  };

  const handleCreateStaff = async (event: FormEvent) => {
    event.preventDefault();

    if (!staffForm.name.trim() || !staffForm.email.trim() || !staffForm.password.trim()) {
      toast.error("Preencha nome, email e senha do novo acesso");
      return;
    }

    try {
      await withLoading(
        () =>
          createStaffMutation.mutateAsync({
            name: staffForm.name.trim(),
            email: staffForm.email.trim().toLowerCase(),
            password: staffForm.password,
            role: staffForm.role,
          }),
        { message: "Criando login da equipe" }
      );

      setStaffForm(EMPTY_STAFF_FORM);
      setIsCreateStaffOpen(false);
      await staffQuery.refetch();
      toast.success("Login criado com sucesso");
    } catch (error) {
      console.error(error);
      toast.error("Nao foi possivel criar esse login");
    }
  };

  const handleToggleStaff = async (member: LocalUser) => {
    try {
      await withLoading(
        () =>
          updateStaffMutation.mutateAsync({
            id: Number(member.id),
            isActive: !member.isActive,
          }),
        { message: member.isActive ? "Desativando acesso" : "Reativando acesso" }
      );

      await staffQuery.refetch();
      toast.success(member.isActive ? "Acesso desativado" : "Acesso reativado");
    } catch (error) {
      console.error(error);
      toast.error("Nao foi possivel atualizar esse acesso");
    }
  };

  const handleResetStaffPassword = async (member: LocalUser) => {
    const nextPassword = staffPasswordDrafts[member.id]?.trim();
    if (!nextPassword || nextPassword.length < 6) {
      toast.error("Digite uma nova senha com pelo menos 6 caracteres");
      return;
    }

    try {
      await withLoading(
        () =>
          updateStaffMutation.mutateAsync({
            id: Number(member.id),
            password: nextPassword,
          }),
        { message: "Atualizando senha de acesso" }
      );

      setStaffPasswordDrafts((current) => ({ ...current, [member.id]: "" }));
      toast.success("Senha atualizada com sucesso");
    } catch (error) {
      console.error(error);
      toast.error("Nao foi possivel atualizar a senha");
    }
  };

  const handleCreateTable = async (event: FormEvent) => {
    event.preventDefault();

    const tableNumber = Number(tableForm.number);
    if (!Number.isInteger(tableNumber) || tableNumber <= 0) {
      toast.error("Informe um numero de mesa valido");
      return;
    }

    try {
      const createdTable = (await withLoading(
        () =>
          createTableMutation.mutateAsync({
            number: tableNumber,
            label: tableForm.label.trim() || undefined,
          }),
        { message: "Cadastrando mesa e preparando QR Code" }
      )) as DiningTable;

      setTableForm(EMPTY_TABLE_FORM);
      setIsCreateTableOpen(false);
      await tablesQuery.refetch();
      await buildTableQrPdf(createdTable);
      toast.success(`Mesa ${createdTable.number} cadastrada com PDF pronto para impressao`);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes("ja cadastrada")) {
        toast.error(message);
      } else {
        toast.error("Nao foi possivel cadastrar essa mesa");
      }
    }
  };

  const handleCopyTableLink = async (table: DiningTable) => {
    try {
      await navigator.clipboard.writeText(getTablePublicUrl(table));
      toast.success(`Link da Mesa ${table.number} copiado`);
    } catch (error) {
      console.error(error);
      toast.error("Nao foi possivel copiar o link da mesa");
    }
  };

  const handleDownloadTablePdf = async (table: DiningTable) => {
    try {
      await withLoading(() => buildTableQrPdf(table), {
        message: `Gerando PDF da Mesa ${table.number}`,
      });
      toast.success(`PDF da Mesa ${table.number} gerado`);
    } catch (error) {
      console.error(error);
      toast.error("Nao foi possivel gerar o PDF dessa mesa");
    }
  };

  const handleSaveAutoSettings = async () => {
    const preparingPercent = Math.max(0, Math.min(80, Number(autoPreparingPercent) || 15));
    const graceMinutes = Math.max(0, Math.min(120, Number(autoDeliveredGraceMinutes) || 8));

    try {
      await withLoading(
        () =>
          updateSettingsMutation.mutateAsync({
            autoPreparingPercent: preparingPercent,
            autoDeliveredGraceMinutes: graceMinutes,
          }),
        { message: "Salvando configuracoes de automacao" }
      );
      await settingsQuery.refetch();
      toast.success("Configuracao de automacao atualizada");
    } catch (error) {
      console.error(error);
      toast.error("Nao foi possivel salvar as configuracoes");
    }
  };

  const updateShowcaseSlide = (
    id: string,
    updater: (slide: ShowcaseSlideForm) => ShowcaseSlideForm
  ) => {
    setShowcaseSlidesDraft((current) => current.map((slide) => (slide.id === id ? updater(slide) : slide)));
  };

  const handleShowcaseImageUpload = (slideId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        updateShowcaseSlide(slideId, (current) => ({
          ...current,
          imageUrl: result,
        }));
      }
    };
    reader.readAsDataURL(file);
  };

  const moveShowcaseSlide = (id: string, direction: "up" | "down") => {
    setShowcaseSlidesDraft((current) => {
      const index = current.findIndex((slide) => slide.id === id);
      if (index < 0) return current;
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  };

  const handleSaveShowcaseAlbum = async () => {
    const payload = buildShowcasePayload();
    const activeSlides = payload.showcaseSlides.filter((slide) => slide.isActive);
    if (activeSlides.length === 0) {
      toast.error("Adicione pelo menos 1 slide ativo com foto para publicar na TV");
      return;
    }

    try {
      await withLoading(
        () =>
          updateSettingsMutation.mutateAsync({
            showcaseSlideSeconds: payload.showcaseSlideSeconds,
            showcaseTitle: payload.showcaseTitle,
            showcaseSubtitle: payload.showcaseSubtitle,
            showcaseSlides: payload.showcaseSlides,
          }),
        { message: "Salvando album da TV" }
      );
      await settingsQuery.refetch();
      setIsShowcaseAlbumOpen(false);
      toast.success("Album da TV atualizado");
    } catch (error) {
      console.error(error);
      toast.error("Nao foi possivel salvar o album da TV");
    }
  };

  const buildShowcasePayload = () => {
    const defaultSeconds = Math.max(3, Math.min(30, Number(showcaseDefaultSeconds) || 6));
    const slides = showcaseSlidesDraft
      .map((slide, index) => ({
        id: slide.id || `slide-${index + 1}`,
        title: slide.title.trim() || `Slide ${index + 1}`,
        imageUrl: slide.imageUrl.trim(),
        durationSeconds: Math.max(3, Math.min(30, Number(slide.durationSeconds) || defaultSeconds)),
        isActive: slide.isActive,
      }))
      .filter((slide) => slide.imageUrl.length > 0);

    return {
      showcaseSlideSeconds: defaultSeconds,
      showcaseTitle: showcaseTitle.trim() || "Fogareiro ITZ Restaurante",
      showcaseSubtitle: showcaseSubtitle.trim() || "Cardapio da casa",
      showcaseSlides: slides,
    };
  };

  const handlePreviewShowcase = () => {
    try {
      const payload = buildShowcasePayload();
      (window as Window & { __fogareiroShowcasePreview?: unknown }).__fogareiroShowcasePreview = payload;
      const previewWindow = window.open("/painel-clientes?preview=1", "_blank");
      if (previewWindow) {
        setTimeout(() => {
          previewWindow.postMessage(
            { type: "fogareiro-showcase-preview", payload },
            window.location.origin
          );
        }, 250);
      }
    } catch (error) {
      console.error(error);
      toast.error("Nao foi possivel abrir o preview");
    }
  };

  const handlePublishShowcaseNow = async () => {
    const payload = buildShowcasePayload();
    const activeSlides = payload.showcaseSlides.filter((slide) => slide.isActive);
    if (activeSlides.length === 0) {
      toast.error("Adicione pelo menos 1 slide ativo com foto para publicar na TV");
      return;
    }
    try {
      await withLoading(
        () =>
          updateSettingsMutation.mutateAsync({
            showcaseSlideSeconds: payload.showcaseSlideSeconds,
            showcaseTitle: payload.showcaseTitle,
            showcaseSubtitle: payload.showcaseSubtitle,
            showcaseSlides: payload.showcaseSlides,
          }),
        { message: "Publicando album da TV" }
      );
      await settingsQuery.refetch();
      setIsShowcaseAlbumOpen(false);
      window.open("/painel-clientes", "_blank");
      toast.success("Album publicado com sucesso");
    } catch (error) {
      console.error(error);
      toast.error("Nao foi possivel publicar o album");
    }
  };

  const handleLogout = async () => {
    await logout();
    await pulseLoading("Saindo do painel", 950);
    setLocation("/");
  };

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
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

  if (!isAuthenticated || user?.role !== "admin") {
    return null;
  }

  const metricCardClass =
    "fogareiro-admin-metric group relative overflow-hidden rounded-[1.6rem] border border-border/70 bg-[linear-gradient(180deg,rgba(63,24,31,0.9),rgba(42,17,22,0.92))] shadow-[0_18px_48px_rgba(0,0,0,0.16)] before:pointer-events-none before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/18 before:to-transparent";
  const sectionCardClass =
    "fogareiro-admin-section overflow-hidden rounded-[1.9rem] border border-border/70 bg-[linear-gradient(180deg,rgba(58,23,30,0.94),rgba(38,15,21,0.95))] shadow-[0_24px_60px_rgba(0,0,0,0.2)]";

  return (
    <div className="mothers-day-shell min-h-screen bg-background">
      <RestaurantHeader
        showCart={false}
        title="Painel Administrativo"
        subtitle={`Bem-vindo, ${user?.name}`}
      />

      <div className="border-b border-border bg-card/95">
        <div className="container mx-auto flex flex-col gap-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-background/70 px-3 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <BellRing className="h-4 w-4 text-accent" />
              {stats.waitingApproval} aguardando aprovacao
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-background/70 px-3 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <ShieldCheck className="h-4 w-4 text-accent" />
              {stats.pendingOrders} pedido(s) em andamento
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                Promise.all([
                  ordersQuery.refetch(),
                  cashierQuery.refetch(),
                  tablesQuery.refetch(),
                  staffQuery.refetch(),
                  settingsQuery.refetch(),
                ])
              }
              className="gap-2"
            >
              <RefreshCcw className="h-4 w-4" />
              Atualizar
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsShowcaseAlbumOpen(true)}
              className="gap-2"
            >
              <MonitorPlay className="h-4 w-4" />
              Editar tela de clientes
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                await pulseLoading("Abrindo painel da cozinha", 950);
                setLocation("/cozinha");
              }}
              className="gap-2"
            >
              <Soup className="h-4 w-4" />
              Painel da cozinha
            </Button>
            <Button variant="outline" onClick={handleLogout} className="gap-2">
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </div>

      <main className="container mx-auto space-y-6 py-6 md:space-y-8 md:py-8">
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(69,24,35,0.95),rgba(42,15,23,0.93))] px-5 py-5 shadow-[0_30px_80px_rgba(0,0,0,0.22)] sm:px-6 lg:px-7">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(340px,0.9fr)] lg:items-stretch">
            <div className="rounded-[1.8rem] border border-white/8 bg-black/10 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-6">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.35em] text-accent/90">
                <Sparkles className="h-4 w-4" />
                Centro de comando
              </div>
              <h2 className="mt-4 max-w-4xl text-2xl font-black leading-[1.02] text-foreground sm:text-3xl lg:text-[3rem]">
                Tudo o que o restaurante precisa, logo na entrada do painel.
              </h2>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                Monitore operacao, acompanhe pedidos e tome decisoes mais rapido com os
                indicadores principais, a equipe e a gestao do cardapio em um unico lugar.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/8 bg-background/25 p-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-muted-foreground">
                    <Activity className="h-4 w-4 text-accent" />
                    Operacao
                  </div>
                  <p className="mt-3 text-sm text-foreground">
                    {stats.pendingOrders} pedido(s) em andamento agora.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-background/25 p-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-muted-foreground">
                    <ClipboardList className="h-4 w-4 text-accent" />
                    Cardapio
                  </div>
                  <p className="mt-3 text-sm text-foreground">
                    {stats.activeProducts} itens ativos e {stats.hiddenProducts} ocultos.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-background/25 p-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-muted-foreground">
                    <BriefcaseBusiness className="h-4 w-4 text-accent" />
                    Equipe
                  </div>
                  <p className="mt-3 text-sm text-foreground">
                    Painel pronto para administrar equipe e operacao.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-[1.7rem] border border-accent/18 bg-[linear-gradient(180deg,rgba(0,0,0,0.14),rgba(255,255,255,0.01))] px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                      Hoje
                    </p>
                    <p className="mt-2 text-3xl font-black text-accent">{formatPrice(stats.todayRevenue)}</p>
                    <p className="mt-2 text-xs text-muted-foreground">Receita acumulada no dia</p>
                  </div>
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                    <WalletCards className="h-5 w-5" />
                  </span>
                </div>
              </div>
              <div className="rounded-[1.7rem] border border-white/8 bg-[linear-gradient(180deg,rgba(0,0,0,0.14),rgba(255,255,255,0.01))] px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                      Em aberto
                    </p>
                    <p className="mt-2 text-3xl font-black text-foreground">{stats.pendingOrders}</p>
                    <p className="mt-2 text-xs text-muted-foreground">Pedidos exigindo acompanhamento</p>
                  </div>
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/8 text-foreground">
                    <HandPlatter className="h-5 w-5" />
                  </span>
                </div>
              </div>
              <div className="rounded-[1.7rem] border border-white/8 bg-[linear-gradient(180deg,rgba(0,0,0,0.14),rgba(255,255,255,0.01))] px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                      Ticket medio
                    </p>
                    <p className="mt-2 text-3xl font-black text-foreground">{formatPrice(stats.averageTicket)}</p>
                    <p className="mt-2 text-xs text-muted-foreground">Media por pedido no mes</p>
                  </div>
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/8 text-foreground">
                    <Sparkles className="h-5 w-5" />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <button
            type="button"
            onClick={() => scrollToSection("admin-mesas")}
            className="fogareiro-admin-shortcut rounded-[1.45rem] border border-border/70 bg-card/78 p-4 text-left shadow-[0_16px_42px_rgba(0,0,0,0.12)] transition hover:-translate-y-0.5 hover:border-accent/35 hover:bg-card"
          >
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Navegacao</p>
            <p className="mt-2 font-semibold text-foreground">Mesas e QR Codes</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Cadastre mesas e gere os PDFs de impressao.
            </p>
          </button>

          <button
            type="button"
            onClick={() => scrollToSection("admin-equipe")}
            className="fogareiro-admin-shortcut rounded-[1.45rem] border border-border/70 bg-card/78 p-4 text-left shadow-[0_16px_42px_rgba(0,0,0,0.12)] transition hover:-translate-y-0.5 hover:border-accent/35 hover:bg-card"
          >
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Equipe</p>
            <p className="mt-2 font-semibold text-foreground">Logins e acessos</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Crie usuarios e deixe a operacao organizada.
            </p>
          </button>

          <button
            type="button"
            onClick={() => scrollToSection("admin-pedidos")}
            className="fogareiro-admin-shortcut rounded-[1.45rem] border border-border/70 bg-card/78 p-4 text-left shadow-[0_16px_42px_rgba(0,0,0,0.12)] transition hover:-translate-y-0.5 hover:border-accent/35 hover:bg-card"
          >
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Operacao</p>
            <p className="mt-2 font-semibold text-foreground">Pedidos recentes</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Acompanhe a fila e o ritmo do restaurante.
            </p>
          </button>

          <button
            type="button"
            onClick={() => scrollToSection("admin-caixa")}
            className="fogareiro-admin-shortcut rounded-[1.45rem] border border-border/70 bg-card/78 p-4 text-left shadow-[0_16px_42px_rgba(0,0,0,0.12)] transition hover:-translate-y-0.5 hover:border-accent/35 hover:bg-card"
          >
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Caixa</p>
            <p className="mt-2 font-semibold text-foreground">Receber comandas</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Busque por cliente, telefone ou mesa e finalize no caixa.
            </p>
          </button>

          <button
            type="button"
            onClick={() => scrollToSection("admin-cardapio")}
            className="fogareiro-admin-shortcut rounded-[1.45rem] border border-border/70 bg-card/78 p-4 text-left shadow-[0_16px_42px_rgba(0,0,0,0.12)] transition hover:-translate-y-0.5 hover:border-accent/35 hover:bg-card"
          >
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Cardapio</p>
            <p className="mt-2 font-semibold text-foreground">Produtos e categorias</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Atualize itens, imagens e destaques da casa.
            </p>
          </button>

          <button
            type="button"
            onClick={() => scrollToSection("admin-tv")}
            className="fogareiro-admin-shortcut rounded-[1.45rem] border border-border/70 bg-card/78 p-4 text-left shadow-[0_16px_42px_rgba(0,0,0,0.12)] transition hover:-translate-y-0.5 hover:border-accent/35 hover:bg-card"
          >
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Tela da TV</p>
            <p className="mt-2 font-semibold text-foreground">Album de slides</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Escolha fotos exclusivas e tempo de exibicao.
            </p>
          </button>

          <button
            type="button"
            onClick={() => window.open("/painel-clientes", "_blank")}
            className="fogareiro-admin-shortcut rounded-[1.45rem] border border-border/70 bg-card/78 p-4 text-left shadow-[0_16px_42px_rgba(0,0,0,0.12)] transition hover:-translate-y-0.5 hover:border-accent/35 hover:bg-card"
          >
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Tela clientes</p>
            <p className="mt-2 font-semibold text-foreground">Painel vitrine</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Mostra logo, fotos dos pratos e ultimos pedidos ao vivo.
            </p>
          </button>
        </section>

        <section className="grid grid-cols-2 gap-3 xl:grid-cols-4 2xl:grid-cols-8">
          <Card className={metricCardClass}>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                  Ativos
                </p>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-white/8 text-foreground">
                  <Boxes className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold text-foreground sm:text-3xl">
                {stats.activeProducts}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">Itens visiveis no cardapio</p>
            </CardContent>
          </Card>
          <Card className={metricCardClass}>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                  Ocultos
                </p>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-white/8 text-foreground">
                  <EyeOff className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold text-foreground sm:text-3xl">
                {stats.hiddenProducts}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">Itens fora da exibicao</p>
            </CardContent>
          </Card>
          <Card className={`${metricCardClass} ring-1 ring-accent/25`}>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                  Aguardando
                </p>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-accent/14 text-accent">
                  <BellRing className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold text-accent sm:text-3xl">
                {stats.waitingApproval}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">Pedidos pedindo aceite</p>
            </CardContent>
          </Card>
          <Card className={metricCardClass}>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                  Pedidos abertos
                </p>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-white/8 text-foreground">
                  <HandPlatter className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold text-foreground sm:text-3xl">
                {stats.pendingOrders}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">Fluxos ainda nao encerrados</p>
            </CardContent>
          </Card>
          <Card className={metricCardClass}>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                  Categorias
                </p>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-white/8 text-foreground">
                  <ClipboardList className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold text-foreground sm:text-3xl">
                {stats.categories}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">Grupos ativos no catalogo</p>
            </CardContent>
          </Card>
          <Card className={metricCardClass}>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                  Total pedidos
                </p>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-white/8 text-foreground">
                  <ClipboardList className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold text-foreground sm:text-3xl">
                {stats.totalOrders}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">Historico registrado no sistema</p>
            </CardContent>
          </Card>
          <Card className={metricCardClass}>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                  Cancelados
                </p>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-destructive/14 text-destructive">
                  <XCircle className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold text-destructive sm:text-3xl">
                {stats.cancelledOrders}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">Pedidos que nao seguiram</p>
            </CardContent>
          </Card>
          <Card className={metricCardClass}>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                  Entregues no mes
                </p>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-white/8 text-foreground">
                  <PackageCheck className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold text-foreground sm:text-3xl">
                {stats.deliveredThisMonth}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">Pedidos finalizados no periodo</p>
            </CardContent>
          </Card>
          <Card className={`${metricCardClass} col-span-2 xl:col-span-1 2xl:col-span-1`}>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                  Faturamento do mes
                </p>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-accent/14 text-accent">
                  <WalletCards className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold text-accent sm:text-3xl">
                {formatPrice(stats.monthlyRevenue)}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {stats.monthlyCancelled} cancelado(s) no mes
              </p>
            </CardContent>
          </Card>
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <Card id="admin-pedidos" className={`${sectionCardClass} scroll-mt-28`}>
            <CardHeader>
              <CardTitle>Resumo comercial</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-border/70 bg-background/40 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                  Ticket medio do mes
                </p>
                <p className="mt-3 text-2xl font-bold text-foreground">
                  {formatPrice(stats.averageTicket)}
                </p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/40 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                  Total vendido hoje
                </p>
                <p className="mt-3 text-2xl font-bold text-accent">
                  {formatPrice(stats.todayRevenue)}
                </p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/40 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                  Cancelamentos do mes
                </p>
                <p className="mt-3 text-2xl font-bold text-destructive">
                  {stats.monthlyCancelled}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className={sectionCardClass}>
            <CardHeader>
              <CardTitle>Panorama presencial</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-2xl border border-border/70 bg-background/40 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted-foreground">Receita presencial no mes</span>
                  <strong className="text-foreground">{formatPrice(stats.monthlyRevenue)}</strong>
                </div>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/40 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted-foreground">Mesas livres agora</span>
                  <strong className="text-foreground">
                    {diningTables.filter((table) => !occupiedTableIds.has(Number(table.id)) && table.isActive).length}
                  </strong>
                </div>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/40 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted-foreground">Mesas em operacao</span>
                  <strong className="text-foreground">
                    {diningTables.filter((table) => occupiedTableIds.has(Number(table.id))).length}
                  </strong>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid grid-cols-1 gap-6">
          <Card className={sectionCardClass}>
            <CardHeader>
              <CardTitle>Automacao da cozinha</CardTitle>
              <p className="text-sm text-muted-foreground">
                Ajuste como o sistema avanca o pedido automaticamente por tempo.
              </p>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
              <div>
                <label className="mb-2 block text-sm font-semibold">Entrar em preparo (%)</label>
                <Input
                  type="number"
                  min="0"
                  max="80"
                  value={autoPreparingPercent}
                  onChange={(event) => setAutoPreparingPercent(event.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Exemplo: 15% significa que o pedido vira "Em preparo" aos 15% do tempo total.
                </p>
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">Minutos para auto-entregue</label>
                <Input
                  type="number"
                  min="0"
                  max="120"
                  value={autoDeliveredGraceMinutes}
                  onChange={(event) => setAutoDeliveredGraceMinutes(event.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Tempo adicional apos "Pronto" para marcar "Entregue" automaticamente.
                </p>
              </div>
              <Button
                onClick={handleSaveAutoSettings}
                disabled={updateSettingsMutation.isPending}
                className="bg-accent text-accent-foreground hover:bg-accent/90"
              >
                Salvar automacao
              </Button>
            </CardContent>
          </Card>
        </section>

        <section id="admin-tv" className="scroll-mt-28 grid grid-cols-1 gap-6">
          <Card className={sectionCardClass}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MonitorPlay className="h-5 w-5 text-accent" />
                Album da TV (separado do cardapio)
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Cadastre fotos exclusivas para a tela do cliente, sem depender das imagens dos pratos.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-border/70 bg-background/35 p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Slides cadastrados</p>
                  <p className="mt-2 text-2xl font-bold text-foreground">{showcaseSlidesDraft.length}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/35 p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Slides ativos</p>
                  <p className="mt-2 text-2xl font-bold text-accent">
                    {showcaseSlidesDraft.filter((slide) => slide.isActive && slide.imageUrl.trim()).length}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/35 p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Tempo padrao</p>
                  <p className="mt-2 text-2xl font-bold text-foreground">{showcaseDefaultSeconds}s</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => setIsShowcaseAlbumOpen(true)}
                  className="bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  Gerenciar album da TV
                </Button>
                <Button type="button" variant="outline" onClick={() => window.open("/painel-clientes", "_blank")}>
                  Abrir painel de clientes
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        <section id="admin-caixa" className="scroll-mt-28">
          <Card className={sectionCardClass}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <WalletCards className="h-5 w-5 text-accent" />
                Caixa e comandas
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Pagamento concentrado no caixa. Toda comanda entra com 10% de garcom por padrao,
                com opcao de remover se o cliente nao quiser.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">
                Somente o perfil de caixa pode receber pagamentos. Este quadro no admin e apenas para acompanhamento.
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <Input
                  value={cashierSearch}
                  onChange={(event) => setCashierSearch(event.target.value)}
                  placeholder="Buscar por nome, telefone ou numero da mesa"
                />
                <Badge variant="outline" className="w-fit">
                  {filteredCashierOrders.length} conta(s) pendente(s)
                </Badge>
              </div>

              {filteredCashierOrders.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 bg-background/40 p-4 text-sm text-muted-foreground">
                  Nenhuma comanda pendente para esse filtro.
                </div>
              ) : (
                <div className="fogareiro-scrollbar max-h-[28rem] space-y-3 overflow-y-auto pr-2">
                  {filteredCashierOrders.map((order) => {
                    const subtotal = Number(order.total);
                    const serviceFeeAmount = Math.round(subtotal * 0.1);
                    const finalTotal = subtotal + serviceFeeAmount;

                    return (
                      <div
                        key={order.id}
                        className="rounded-[1.45rem] border border-border/70 bg-background/40 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="font-semibold text-foreground">Comanda #{order.id}</p>
                            <p className="text-sm text-muted-foreground">{order.customerName}</p>
                            <p className="text-xs text-muted-foreground">
                              Telefone: {formatPhone(order.customerPhone)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Mesa: {order.tableNumber ? `Mesa ${order.tableNumber}` : "Sem mesa"}
                            </p>
                          </div>
                          <Badge>{ORDER_STATUS_LABEL[order.status] ?? order.status}</Badge>
                        </div>

                        <div className="mt-4 space-y-2 rounded-xl border border-border/60 bg-card/55 p-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">Subtotal</span>
                            <strong className="text-foreground">{formatPrice(subtotal)}</strong>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">Servico (10%)</span>
                            <strong className="text-foreground">{formatPrice(serviceFeeAmount)}</strong>
                          </div>
                          <div className="flex items-center justify-between gap-3 border-t border-border/50 pt-2">
                            <span className="font-semibold text-foreground">Total da conta</span>
                            <strong className="text-lg text-accent">{formatPrice(finalTotal)}</strong>
                          </div>
                        </div>

                        <div className="mt-3 rounded-xl border border-border/60 bg-card/50 px-3 py-2 text-sm text-muted-foreground">
                          Recebimento bloqueado no admin. Use o painel <strong className="text-foreground">/caixa</strong> com usuario de caixa.
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {stats.waitingApproval > 0 && (
          <section className="rounded-[1.75rem] border border-accent/35 bg-gradient-to-r from-accent/18 via-card/95 to-card/88 p-4 shadow-[0_18px_46px_rgba(0,0,0,0.14)] sm:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <BellRing className="h-4 w-4 text-accent" />
                  Novos pedidos aguardando aceite
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Assim que alguem pedir pelo cardapio, a equipe recebe esse aviso em tempo real.
                </p>
              </div>
              <Badge className="w-fit bg-accent text-accent-foreground">
                {stats.waitingApproval} aguardando aprovacao
              </Badge>
            </div>
          </section>
        )}

        <section
          id="admin-mesas"
          className="scroll-mt-28 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]"
        >
          <Card className={sectionCardClass}>
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <MapPinned className="h-5 w-5 text-accent" />
                  Mesas e QR Codes
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Cadastre mesas, gere o QR automaticamente e entregue um PDF pronto para imprimir no salao.
                </p>
              </div>
              <Button
                className="w-full gap-2 bg-accent text-accent-foreground hover:bg-accent/90 sm:w-auto"
                onClick={() => setIsCreateTableOpen(true)}
              >
                <QrCode className="h-4 w-4" />
                Nova mesa
              </Button>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-border/70 bg-background/35 p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                    Mesas cadastradas
                  </p>
                  <p className="mt-2 text-2xl font-bold text-foreground">{stats.totalTables}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/35 p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                    Livres agora
                  </p>
                  <p className="mt-2 text-2xl font-bold text-accent">
                    {
                      diningTables.filter((table) => !occupiedTableIds.has(Number(table.id)) && table.isActive)
                        .length
                    }
                  </p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/35 p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                    Ocupadas
                  </p>
                  <p className="mt-2 text-2xl font-bold text-foreground/90">
                    {diningTables.filter((table) => occupiedTableIds.has(Number(table.id))).length}
                  </p>
                </div>
              </div>

              <div className="fogareiro-scrollbar max-h-[26rem] space-y-3 overflow-y-auto pr-3">
                {diningTables.map((table) => {
                  const isOccupied = occupiedTableIds.has(Number(table.id));

                  return (
                    <div
                      key={table.id}
                      className="rounded-[1.5rem] border border-border/70 bg-background/40 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                    >
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-foreground">Mesa {table.number}</p>
                            <Badge
                              variant={isOccupied ? "secondary" : "default"}
                              className={
                                isOccupied
                                  ? "rounded-full bg-secondary/70 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-secondary-foreground"
                                  : "rounded-full bg-accent px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-accent-foreground"
                              }
                            >
                              {isOccupied ? "ocupada" : "livre"}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {table.label || `Mesa ${table.number}`} - QR liberado para pedido presencial
                          </p>
                          <p className="mt-2 max-w-3xl break-all text-xs leading-5 text-muted-foreground/85">
                            {getTablePublicUrl(table)}
                          </p>
                        </div>

                        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 xl:w-auto xl:min-w-[19rem]">
                          <Button
                            variant="outline"
                            className="h-11 gap-2 rounded-2xl px-4"
                            onClick={() => handleCopyTableLink(table)}
                          >
                            <Copy className="h-4 w-4" />
                            Copiar link
                          </Button>
                          <Button
                            className="h-11 gap-2 rounded-2xl bg-accent px-4 text-accent-foreground hover:bg-accent/90"
                            onClick={() => handleDownloadTablePdf(table)}
                          >
                            <Download className="h-4 w-4" />
                            Baixar PDF
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {diningTables.length === 0 && (
                  <div className="rounded-[1.5rem] border border-dashed border-border/70 bg-background/25 p-6 text-sm text-muted-foreground">
                    Nenhuma mesa cadastrada ainda. Cadastre a primeira mesa para gerar o QR e imprimir o PDF.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className={sectionCardClass}>
            <CardHeader>
              <CardTitle>Experiencia do cliente no salao</CardTitle>
              <p className="text-sm text-muted-foreground">
                O cliente pode navegar no cardapio de fora, mas so consegue pedir depois de escanear o QR da mesa dentro do restaurante.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-[1.5rem] border border-accent/20 bg-accent/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accent/90">
                  Fluxo seguro
                </p>
                <div className="mt-3 space-y-3 text-sm text-muted-foreground">
                  <p>1. O visitante externo ve o cardapio completo, fotos e categorias.</p>
                  <p>2. Sem QR da mesa, o sistema bloqueia o checkout e reforca o convite para visitar o Fogareiro.</p>
                  <p>3. Dentro do restaurante, o QR libera o pedido presencial com mesa, nome e telefone.</p>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-border/70 bg-background/35 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                  O que sai no PDF
                </p>
                <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <p>QR Code da mesa</p>
                  <p>Numero e nome da mesa</p>
                  <p>Link direto para o cardapio presencial</p>
                  <p>Layout pronto para imprimir e colocar na mesa</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section
          id="admin-equipe"
          className="scroll-mt-28 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]"
        >
          <Card className={sectionCardClass}>
            <CardHeader>
              <CardTitle>Gerenciador de login</CardTitle>
              <p className="text-sm text-muted-foreground">
                Crie acessos da equipe e mantenha controle rapido de permissoes e senhas.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setIsCreateStaffOpen(true)}
                  className="rounded-[1.6rem] border border-border/70 bg-background/40 p-5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:-translate-y-0.5 hover:border-accent/40 hover:bg-background/55"
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-accent-foreground shadow-[0_12px_26px_rgba(255,138,109,0.22)]">
                      <UserPlus2 className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-semibold text-foreground">Criar novo login</p>
                      <p className="text-sm text-muted-foreground">
                        Cadastre administrador, cozinha ou garcom.
                      </p>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setIsManageStaffOpen(true)}
                  className="rounded-[1.6rem] border border-border/70 bg-background/40 p-5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:-translate-y-0.5 hover:border-accent/40 hover:bg-background/55"
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/8 text-foreground">
                      <Users2 className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-semibold text-foreground">Gerenciar equipe</p>
                      <p className="text-sm text-muted-foreground">
                        Veja acessos, troque senhas e ative ou desative usuarios.
                      </p>
                    </div>
                  </div>
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-border/70 bg-background/35 p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                    Total de acessos
                  </p>
                  <p className="mt-2 text-2xl font-bold text-foreground">{localUsers.length}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/35 p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                    Acessos ativos
                  </p>
                  <p className="mt-2 text-2xl font-bold text-accent">
                    {localUsers.filter((member) => member.isActive).length}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/35 p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                    Perfis criados
                  </p>
                  <p className="mt-2 text-sm font-semibold text-foreground">
                    Admin, cozinha e garcom
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Dialog open={isShowcaseAlbumOpen} onOpenChange={setIsShowcaseAlbumOpen}>
            <DialogContent className="max-h-[calc(100dvh-1rem)] max-w-[min(1080px,calc(100vw-1rem))] border-border/70 bg-card/98 sm:max-w-[min(1080px,calc(100vw-2rem))]">
              <DialogHeader className="pr-8">
                <DialogTitle>Album da TV</DialogTitle>
                <DialogDescription>
                  Adicione fotos exclusivas para o slideshow da tela dos clientes.
                </DialogDescription>
              </DialogHeader>

              <div className="fogareiro-scrollbar max-h-[calc(100dvh-16rem)] space-y-4 overflow-y-auto pr-1">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                  <div>
                    <label className="mb-2 block text-sm font-semibold">Tempo padrao (segundos)</label>
                    <Input
                      type="number"
                      min="3"
                      max="30"
                      value={showcaseDefaultSeconds}
                      onChange={(event) => setShowcaseDefaultSeconds(event.target.value)}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Usado quando o slide nao tiver tempo personalizado.
                    </p>
                  </div>
                  <div className="space-y-3 rounded-2xl border border-border/70 bg-background/35 p-4">
                    <div>
                      <label className="mb-2 block text-sm font-semibold">Titulo da tela</label>
                      <Input
                        placeholder="Ex: Fogareiro ITZ Restaurante"
                        value={showcaseTitle}
                        onChange={(event) => setShowcaseTitle(event.target.value)}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold">Subtitulo da tela</label>
                      <Input
                        placeholder="Ex: Cardapio da casa"
                        value={showcaseSubtitle}
                        onChange={(event) => setShowcaseSubtitle(event.target.value)}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Dica: use imagens horizontais (1920x1080) para melhor resultado na TV.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {showcaseSlidesDraft.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/70 bg-background/30 p-4 text-sm text-muted-foreground">
                      Nenhuma foto no album ainda. Clique em "Adicionar slide".
                    </div>
                  ) : (
                    showcaseSlidesDraft.map((slide, index) => (
                      <div key={slide.id} className="rounded-2xl border border-border/70 bg-background/35 p-4">
                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[160px_minmax(0,1fr)_130px_110px_auto] xl:items-start">
                          <div className="h-24 overflow-hidden rounded-xl border border-border/60 bg-black/25 xl:h-full">
                            <img
                              src={slide.imageUrl.trim() || FALLBACK_PRODUCT_IMAGE}
                              alt={slide.title || `Slide ${index + 1}`}
                              className="h-full w-full object-contain"
                            />
                          </div>
                          <div className="space-y-2">
                            <Input
                              placeholder="Titulo do slide (ex: Promocao da semana)"
                              value={slide.title}
                              onChange={(event) =>
                                updateShowcaseSlide(slide.id, (current) => ({ ...current, title: event.target.value }))
                              }
                            />
                            <div className="flex flex-wrap gap-2">
                              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-muted/30">
                                <ImagePlus className="h-4 w-4" />
                                Enviar foto
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(event) => handleShowcaseImageUpload(slide.id, event)}
                                />
                              </label>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() =>
                                  updateShowcaseSlide(slide.id, (current) => ({
                                    ...current,
                                    imageUrl: "",
                                  }))
                                }
                              >
                                Remover foto
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Foto carregada direto do seu computador. Nao precisa link.
                            </p>
                          </div>
                          <div>
                            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              Segundos
                            </label>
                            <Input
                              type="number"
                              min="3"
                              max="30"
                              value={slide.durationSeconds}
                              onChange={(event) =>
                                updateShowcaseSlide(slide.id, (current) => ({
                                  ...current,
                                  durationSeconds: event.target.value,
                                }))
                              }
                            />
                          </div>
                          <label className="inline-flex items-center gap-2 pt-2 text-sm text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={slide.isActive}
                              onChange={(event) =>
                                updateShowcaseSlide(slide.id, (current) => ({ ...current, isActive: event.target.checked }))
                              }
                            />
                            Ativo
                          </label>
                          <div className="flex items-center gap-2 md:justify-end">
                            <Button type="button" variant="outline" size="icon" onClick={() => moveShowcaseSlide(slide.id, "up")}>
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button type="button" variant="outline" size="icon" onClick={() => moveShowcaseSlide(slide.id, "down")}>
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() =>
                                setShowcaseSlidesDraft((current) => current.filter((item) => item.id !== slide.id))
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowcaseSlidesDraft((current) => [...current, EMPTY_SHOWCASE_SLIDE()])}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar slide
                </Button>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsShowcaseAlbumOpen(false)}>
                  Cancelar
                </Button>
                <Button type="button" variant="outline" onClick={handlePreviewShowcase}>
                  Preview em tela cheia
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSaveShowcaseAlbum}
                  disabled={updateSettingsMutation.isPending}
                >
                  Salvar album
                </Button>
                <Button
                  type="button"
                  className="bg-accent text-accent-foreground hover:bg-accent/90"
                  onClick={handlePublishShowcaseNow}
                  disabled={updateSettingsMutation.isPending}
                >
                  Publicar album agora
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isCreateTableOpen} onOpenChange={setIsCreateTableOpen}>
            <DialogContent className="max-h-[calc(100dvh-1rem)] max-w-[min(680px,calc(100vw-1rem))] border-border/70 bg-card/98 sm:max-w-[min(680px,calc(100vw-2rem))]">
              <DialogHeader className="pr-8">
                <DialogTitle>Cadastrar nova mesa</DialogTitle>
                <DialogDescription>
                  Assim que a mesa for criada, o sistema ja libera o QR Code e baixa um PDF pronto para impressao.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateTable} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-semibold">Numero da mesa</label>
                    <Input
                      inputMode="numeric"
                      placeholder="Ex: 12"
                      value={tableForm.number}
                      onChange={(event) =>
                        setTableForm((current) => ({ ...current, number: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold">Nome da mesa</label>
                    <Input
                      placeholder="Ex: Salao principal"
                      value={tableForm.label}
                      onChange={(event) =>
                        setTableForm((current) => ({ ...current, label: event.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-border/70 bg-background/35 p-4 text-sm text-muted-foreground">
                  O PDF vai sair com o QR Code, numero da mesa, link presencial e identidade visual do Fogareiro para colocar diretamente na mesa.
                </div>

                <Button
                  type="submit"
                  className="w-full gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
                  disabled={createTableMutation.isPending}
                >
                  <QrCode className="h-4 w-4" />
                  {createTableMutation.isPending ? "Criando mesa..." : "Criar mesa e baixar PDF"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={isCreateStaffOpen} onOpenChange={setIsCreateStaffOpen}>
            <DialogContent className="max-h-[calc(100dvh-1rem)] max-w-[min(720px,calc(100vw-1rem))] border-border/70 bg-card/98 sm:max-w-[min(720px,calc(100vw-2rem))]">
              <DialogHeader className="pr-8">
                <DialogTitle>Criar novo login</DialogTitle>
                <DialogDescription>
                  Cadastre um novo acesso para a equipe com o perfil certo de operacao.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateStaff} className="fogareiro-scrollbar space-y-4 overflow-y-auto pr-1">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-semibold">Nome</label>
                    <Input
                      placeholder="Nome da pessoa"
                      value={staffForm.name}
                      onChange={(event) =>
                        setStaffForm((current) => ({ ...current, name: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold">Email</label>
                    <Input
                      type="email"
                      placeholder="email@fogareiroitz.com"
                      value={staffForm.email}
                      onChange={(event) =>
                        setStaffForm((current) => ({ ...current, email: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold">Senha inicial</label>
                    <Input
                      type="password"
                      placeholder="Senha inicial"
                      value={staffForm.password}
                      onChange={(event) =>
                        setStaffForm((current) => ({ ...current, password: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold">Perfil</label>
                    <select
                      value={staffForm.role}
                      onChange={(event) =>
                        setStaffForm((current) => ({
                          ...current,
                          role: event.target.value as StaffForm["role"],
                        }))
                      }
                      className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="waiter">Garcom</option>
                      <option value="kitchen">Cozinha</option>
                      <option value="cashier">Caixa</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/35 p-4 text-sm text-muted-foreground">
                  O perfil define como a pessoa entra no sistema e quais areas ela pode operar.
                </div>
                <Button
                  type="submit"
                  className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                  disabled={createStaffMutation.isPending}
                >
                  {createStaffMutation.isPending ? "Criando login..." : "Criar login"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={isManageStaffOpen} onOpenChange={setIsManageStaffOpen}>
            <DialogContent className="max-h-[calc(100dvh-1rem)] max-w-[min(920px,calc(100vw-1rem))] border-border/70 bg-card/98 sm:max-w-[min(920px,calc(100vw-2rem))]">
              <DialogHeader className="pr-8">
                <DialogTitle>Gerenciar equipe</DialogTitle>
                <DialogDescription>
                  Controle acessos, altere senhas e ajuste rapidamente o status de cada usuario.
                </DialogDescription>
              </DialogHeader>
              <div className="fogareiro-scrollbar max-h-[calc(100dvh-12rem)] space-y-3 overflow-y-auto pr-2">
                {localUsers.map((member) => (
                  <div
                    key={member.id}
                    className="rounded-[1.5rem] border border-border/70 bg-background/40 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground">
                          {member.name || member.email}
                        </p>
                        <p className="text-sm text-muted-foreground">{member.email}</p>
                      </div>
                      <Badge variant={member.isActive ? "default" : "outline"}>
                        {member.role}
                      </Badge>
                    </div>

                    <div className="mt-3 space-y-2">
                      <Input
                        type="password"
                        placeholder="Nova senha"
                        value={staffPasswordDrafts[member.id] ?? ""}
                        onChange={(event) =>
                          setStaffPasswordDrafts((current) => ({
                            ...current,
                            [member.id]: event.target.value,
                          }))
                        }
                      />
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Button
                          variant="outline"
                          onClick={() => handleResetStaffPassword(member)}
                          disabled={updateStaffMutation.isPending}
                        >
                          Trocar senha
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => handleToggleStaff(member)}
                          disabled={updateStaffMutation.isPending}
                        >
                          {member.isActive ? "Desativar" : "Ativar"}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>

          <Card className={sectionCardClass}>
            <CardHeader>
              <CardTitle>Pedidos recentes</CardTitle>
              <p className="text-sm text-muted-foreground">
                Veja os ultimos pedidos e acompanhe a operacao em tempo real, enquanto garcom e cozinha cuidam do aceite e do andamento.
              </p>
            </CardHeader>
            <CardContent className="fogareiro-scrollbar max-h-[28rem] space-y-3 overflow-y-auto pr-2">
              {orders.slice(0, 10).map((order) => (
                <div
                  key={order.id}
                  className={`rounded-[1.5rem] border border-border/70 bg-background/40 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${
                    order.status === "pending" ? "ring-1 ring-accent/25" : ""
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-foreground">Pedido #{order.id}</p>
                      <p className="text-sm text-muted-foreground">{order.customerName}</p>
                    </div>
                    <Badge>{ORDER_STATUS_LABEL[order.status] ?? order.status}</Badge>
                  </div>
                  <div className="mt-3 flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                    <span>{ORDER_TYPE_LABEL}</span>
                    <span>{formatPrice(order.total)}</span>
                  </div>
                </div>
              ))}

              {orders.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Ainda nao ha pedidos registrados no sistema.
                </p>
              )}
            </CardContent>
          </Card>
        </section>

        <section
          id="admin-cardapio"
          className="scroll-mt-28 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]"
        >
          <div className="rounded-[2rem] border border-border/70 bg-[linear-gradient(180deg,rgba(58,23,30,0.94),rgba(37,14,20,0.95))] p-4 shadow-[0_26px_66px_rgba(0,0,0,0.22)] backdrop-blur sm:p-6">
            <div className="mb-6 flex flex-col gap-4 lg:mb-8 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <LayoutDashboard className="h-4 w-4 text-accent" />
                  Gestao de cardapio
                </p>
                <h2 className="mt-2 text-2xl font-bold text-foreground">
                  Produtos e categorias
                </h2>
                <p className="text-sm text-muted-foreground">
                  {products.length} item(ns) no banco e {categorySuggestions.length} categoria(s)
                </p>
              </div>

              <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogTrigger asChild>
                  <Button
                    onClick={() => handleOpenDialog()}
                    className="w-full gap-2 bg-accent text-accent-foreground hover:bg-accent/90 sm:w-auto"
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar novo item
                  </Button>
                </DialogTrigger>

                <DialogContent className="max-h-[calc(100dvh-1rem)] max-w-[min(1180px,calc(100vw-1rem))] border-border/70 bg-card/98 sm:max-h-[calc(100dvh-2rem)] sm:max-w-[min(1180px,calc(100vw-2rem))] sm:rounded-[1.75rem]">
                  <DialogHeader className="pr-8 pb-2">
                    <DialogTitle>
                      {editingProduct ? "Editar produto" : "Novo produto"}
                    </DialogTitle>
                    <DialogDescription>
                      Um painel mais organizado para ajustar o produto com conforto em qualquer tela.
                    </DialogDescription>
                  </DialogHeader>

                  <form onSubmit={handleSubmit} className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-4">
                    <div className="fogareiro-scrollbar grid min-h-0 gap-4 overflow-y-auto pr-2 sm:gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.8fr)] lg:gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.82fr)]">
                      <div className="space-y-4 sm:space-y-5">
                        <div className="rounded-2xl border border-border/60 bg-background/30 p-4 sm:p-5">
                          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                            Informacoes principais
                          </p>
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                              <label className="mb-2 block text-sm font-semibold">
                                Nome do produto
                              </label>
                              <Input
                                placeholder="Ex: Tambaqui Frito"
                                value={formData.name}
                                onChange={(e) =>
                                  setFormData((current) => ({ ...current, name: e.target.value }))
                                }
                              />
                            </div>
                            <div>
                              <label className="mb-2 block text-sm font-semibold">
                                Categoria
                              </label>
                              <Input
                                list="category-suggestions"
                                placeholder="Ex: PEIXES E FRUTOS DO MAR"
                                value={formData.categoryName}
                                onChange={(e) =>
                                  setFormData((current) => ({
                                    ...current,
                                    categoryName: e.target.value,
                                  }))
                                }
                              />
                              <datalist id="category-suggestions">
                                {categorySuggestions.map((category) => (
                                  <option key={category} value={category} />
                                ))}
                              </datalist>
                            </div>
                            <div>
                              <label className="mb-2 block text-sm font-semibold">
                                Preco (R$)
                              </label>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={formData.price}
                                onChange={(e) =>
                                  setFormData((current) => ({ ...current, price: e.target.value }))
                                }
                              />
                            </div>
                            <div>
                              <label className="mb-2 block text-sm font-semibold">
                                Status
                              </label>
                              <select
                                value={formData.isActive ? "active" : "inactive"}
                                onChange={(e) =>
                                  setFormData((current) => ({
                                    ...current,
                                    isActive: e.target.value === "active",
                                  }))
                                }
                                className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                              >
                                <option value="active">Ativo no cardapio</option>
                                <option value="inactive">Oculto do cardapio</option>
                              </select>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-border/60 bg-background/30 p-4 sm:p-5">
                          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                            Descricao e detalhes
                          </p>
                          <div>
                            <label className="mb-2 block text-sm font-semibold">
                              Descricao
                            </label>
                            <textarea
                              placeholder="Descreva o produto, acompanhamentos e diferenciais..."
                              value={formData.description}
                              onChange={(e) =>
                                setFormData((current) => ({
                                  ...current,
                                  description: e.target.value,
                                }))
                              }
                              className="min-h-40 w-full rounded-lg border border-input bg-background p-3 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                              rows={5}
                            />
                          </div>
                          <div className="mt-4">
                            <label className="mb-2 block text-sm font-semibold">
                              Ingredientes ou observacoes internas
                            </label>
                            <Input
                              placeholder="Ex: arroz, salada, molho, peixe..."
                              value={formData.ingredients}
                              onChange={(e) =>
                                setFormData((current) => ({
                                  ...current,
                                  ingredients: e.target.value,
                                }))
                              }
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4 xl:sticky xl:top-0 xl:self-start">
                        <div className="space-y-3 rounded-2xl border border-dashed border-border/70 bg-background/30 p-4 sm:p-5">
                          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                            Imagem e apresentacao
                          </p>
                          <div className="flex flex-col gap-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between lg:flex-col lg:items-stretch">
                              <div>
                                <p className="font-semibold text-foreground">Imagem</p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                  Voce pode colar uma URL ou enviar um arquivo local.
                                </p>
                              </div>
                              <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-input px-3 py-2 text-sm font-medium hover:bg-muted">
                                <ImagePlus className="h-4 w-4" />
                                Enviar arquivo
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={handleImageUpload}
                                />
                              </label>
                            </div>
                            <Input
                              placeholder="https://exemplo.com/imagem.jpg"
                              value={formData.imageUrl}
                              onChange={(e) =>
                                setFormData((current) => ({
                                  ...current,
                                  imageUrl: e.target.value,
                                }))
                              }
                            />
                            <div>
                              <label className="mb-2 block text-sm font-semibold">
                                Ajuste da foto no cardapio
                              </label>
                              <select
                                value={formData.imageFit}
                                onChange={(e) =>
                                  setFormData((current) => ({
                                    ...current,
                                    imageFit: e.target.value === "contain" ? "contain" : "cover",
                                  }))
                                }
                                className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                              >
                                <option value="cover">Preencher (pode cortar)</option>
                                <option value="contain">Encaixar sem cortar</option>
                              </select>
                            </div>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                              <div>
                                <label className="mb-2 block text-sm font-semibold">
                                  Zoom
                                </label>
                                <input
                                  type="range"
                                  min="50"
                                  max="200"
                                  step="1"
                                  value={formData.imageZoom}
                                  onChange={(e) =>
                                    setFormData((current) => ({
                                      ...current,
                                      imageZoom: Number(e.target.value),
                                    }))
                                  }
                                  className="w-full accent-[var(--accent)]"
                                />
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {formData.imageZoom}%
                                </p>
                              </div>
                              <div>
                                <label className="mb-2 block text-sm font-semibold">
                                  Posição horizontal
                                </label>
                                <input
                                  type="range"
                                  min="0"
                                  max="100"
                                  step="1"
                                  value={formData.imagePositionX}
                                  onChange={(e) =>
                                    setFormData((current) => ({
                                      ...current,
                                      imagePositionX: Number(e.target.value),
                                    }))
                                  }
                                  className="w-full accent-[var(--accent)]"
                                />
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {formData.imagePositionX}%
                                </p>
                              </div>
                              <div>
                                <label className="mb-2 block text-sm font-semibold">
                                  Posição vertical
                                </label>
                                <input
                                  type="range"
                                  min="0"
                                  max="100"
                                  step="1"
                                  value={formData.imagePositionY}
                                  onChange={(e) =>
                                    setFormData((current) => ({
                                      ...current,
                                      imagePositionY: Number(e.target.value),
                                    }))
                                  }
                                  className="w-full accent-[var(--accent)]"
                                />
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {formData.imagePositionY}%
                                </p>
                              </div>
                            </div>
                            <div className="flex justify-end">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setFormData((current) => ({
                                    ...current,
                                    imageFit: "cover",
                                    imagePositionX: 50,
                                    imagePositionY: 50,
                                    imageZoom: 100,
                                  }))
                                }
                              >
                                Resetar enquadramento
                              </Button>
                            </div>
                            <div className="overflow-hidden rounded-[1.35rem] border border-border bg-muted">
                              <img
                                src={formData.imageUrl || FALLBACK_PRODUCT_IMAGE}
                                alt="Pre-visualizacao"
                                className={`h-52 w-full ${getProductImagePresentation(formData).className} sm:h-60 lg:h-72`}
                                style={getProductImagePresentation(formData).style}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-border/60 bg-background/30 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                            Resumo rapido
                          </p>
                          <div className="mt-3 space-y-2 text-sm">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">Nome</span>
                              <span className="max-w-[12rem] truncate font-medium text-foreground">
                                {formData.name || "Sem nome"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">Categoria</span>
                              <span className="max-w-[12rem] truncate font-medium text-foreground">
                                {formData.categoryName || "Sem categoria"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">Status</span>
                              <span className="font-medium text-foreground">
                                {formData.isActive ? "Ativo" : "Oculto"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">Preco</span>
                              <span className="font-medium text-accent">
                                {formData.price ? formatPrice(formData.price) : "R$ 0,00"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-border/70 bg-card/95 pt-4">
                      <Button
                        type="submit"
                        disabled={createMutation.isPending || updateMutation.isPending}
                        className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                      >
                        {createMutation.isPending || updateMutation.isPending
                          ? "Salvando..."
                          : "Salvar produto"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <div className="fogareiro-scrollbar rounded-[1.75rem] border border-white/6 bg-black/10 p-1.5 max-h-[calc(100dvh-18rem)] overflow-y-auto pr-3">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {products.map((product) => (
                <Card
                  key={product.id}
                  className="group overflow-hidden rounded-[1.7rem] border-border/70 bg-[linear-gradient(180deg,rgba(66,25,33,0.92),rgba(44,18,23,0.95))] transition-transform duration-300 hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(0,0,0,0.18)]"
                >
                  <div className="relative h-48 overflow-hidden bg-muted">
                    <img
                      src={product.imageUrl || FALLBACK_PRODUCT_IMAGE}
                      alt={product.name}
                      className={`h-full w-full ${getProductImagePresentation(product).className} transition-transform duration-500`}
                      style={getProductImagePresentation(product).style}
                    />
                    <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 p-4">
                      <Badge variant="secondary" className="backdrop-blur">
                        {product.categoryName || "Sem categoria"}
                      </Badge>
                      <Badge variant={product.isActive ? "default" : "outline"}>
                        {product.isActive ? "Ativo" : "Oculto"}
                      </Badge>
                    </div>
                  </div>
                  <CardHeader className="pb-3">
                    <CardTitle className="line-clamp-2">{product.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {product.description ? (
                      <p className="line-clamp-3 text-sm text-muted-foreground">
                        {product.description}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Sem descricao cadastrada.
                      </p>
                    )}

                    <div className="rounded-2xl border border-white/6 bg-background/40 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                      <span className="text-xl font-bold text-accent">
                        {formatPrice(product.price)}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => handleOpenDialog(product)}
                      >
                        <Edit2 className="h-4 w-4" />
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleActive(product)}
                      >
                        {product.isActive ? "Ocultar" : "Ativar"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 text-destructive hover:bg-destructive/10 sm:col-span-2"
                        onClick={() => handleDelete(product.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Remover do cardapio
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              </div>
            </div>
          </div>

          <div className="space-y-6 xl:sticky xl:top-24 xl:self-start">
            <Card className={sectionCardClass}>
              <CardHeader>
                <CardTitle>Visao rapida do painel</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
                  <p className="font-semibold text-foreground">Operacao do dia</p>
                  <p className="mt-2">
                    {stats.waitingApproval > 0
                      ? `${stats.waitingApproval} pedido(s) aguardando aprovacao no momento.`
                      : "Nenhum pedido aguardando aprovacao agora."}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
                  <p className="font-semibold text-foreground">Cardapio</p>
                  <p className="mt-2">
                    {stats.activeProducts} item(ns) ativos e {stats.hiddenProducts} oculto(s).
                  </p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
                  <p className="font-semibold text-foreground">Receita do mes</p>
                  <p className="mt-2 text-accent">{formatPrice(stats.monthlyRevenue)}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}
