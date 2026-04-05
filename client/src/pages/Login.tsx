import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useGlobalLoading } from "@/contexts/GlobalLoadingContext";
import { trpc } from "@/lib/trpc";
import { LogIn, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function Login() {
  const { user, loading, isAuthenticated } = useAuth();
  const { pulseLoading, withLoading } = useGlobalLoading();
  const [, setLocation] = useLocation();
  const loginMutation = trpc.auth.login.useMutation();
  const restaurantName = import.meta.env.VITE_APP_TITLE || "Fogareiro ITZ Restaurante";
  const restaurantLogo = import.meta.env.VITE_APP_LOGO || "/fogareiro-logo.png";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!loading && isAuthenticated) {
      if (user?.role === "kitchen") {
        setLocation("/cozinha");
        return;
      }

      if (user?.role === "waiter") {
        setLocation("/garcom");
        return;
      }

      if (user?.role === "cashier") {
        setLocation("/caixa");
        return;
      }

      setLocation("/admin");
    }
  }, [loading, isAuthenticated, user, setLocation]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!email.trim() || !password.trim()) {
      toast.error("Informe email e senha");
      return;
    }

    try {
      const loggedUser = await withLoading(
        () =>
          loginMutation.mutateAsync({
            email: email.trim().toLowerCase(),
            password,
          }),
        { message: "Entrando no painel", minDurationMs: 900 }
      );

      toast.success("Login realizado com sucesso");

      if (loggedUser.role === "kitchen") {
        setLocation("/cozinha");
        return;
      }

      if (loggedUser.role === "waiter") {
        setLocation("/garcom");
        return;
      }

      if (loggedUser.role === "cashier") {
        setLocation("/caixa");
        return;
      }

      setLocation("/admin");
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível entrar", {
        description: "Verifique email e senha e tente novamente.",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-accent border-t-transparent" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,138,18,0.18),transparent_34%),radial-gradient(circle_at_bottom,rgba(255,72,0,0.16),transparent_26%)]" />

      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <img
            src={restaurantLogo}
            alt={restaurantName}
            className="mx-auto mb-4 h-24 w-24 object-contain drop-shadow-[0_0_24px_rgba(255,124,17,0.25)]"
          />
          <h1 className="mb-2 text-3xl font-bold text-foreground">{restaurantName}</h1>
          <p className="text-muted-foreground">Acesso interno do restaurante</p>
        </div>

        <Card className="border-border/60 bg-card/90 shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl">Entrar</CardTitle>
            <CardDescription>
              Use seu email e senha para acessar o painel administrativo, cozinha, garçom ou caixa.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="você@fogareiroitz.com"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">Senha</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Digite sua senha"
                />
              </div>

              <Button
                type="submit"
                className="h-12 w-full gap-2 bg-accent text-base font-semibold text-accent-foreground hover:bg-accent/90"
                disabled={loginMutation.isPending}
              >
                <LogIn className="h-5 w-5" />
                {loginMutation.isPending ? "Entrando..." : "Fazer login"}
              </Button>
            </form>

            <div className="rounded-lg border border-border bg-muted/50 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <ShieldCheck className="h-4 w-4 text-accent" />
                Acesso inicial criado
              </p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Os administradores podem criar e gerenciar outros logins direto no painel.
              </p>
            </div>

            <Button
              variant="outline"
              className="h-12 w-full border-border text-foreground hover:bg-muted"
              onClick={async () => {
                await pulseLoading("Voltando ao cardápio", 950);
                setLocation("/");
              }}
            >
              Voltar ao Cardápio
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
