import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

const getReadableApiError = (error: TRPCClientError<any>) => {
  const message = error.message || "Erro ao comunicar com o servidor.";

  if (message === UNAUTHED_ERR_MSG) return null;
  if (message.includes("Telefone invalido")) {
    return "Verifique o telefone informado e tente novamente.";
  }
  if (message.includes("Database not available")) {
    return "Servidor temporariamente indisponível. Tente novamente em instantes.";
  }
  if (message.includes("Unauthorized")) {
    return "Você não tem permissão para realizar essa ação.";
  }

  return "Não foi possível concluir a ação. Tente novamente.";
};

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
    if (error instanceof TRPCClientError) {
      const readableMessage = getReadableApiError(error);
      if (readableMessage) {
        toast.error(readableMessage);
      }
    }
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
    if (error instanceof TRPCClientError) {
      const readableMessage = getReadableApiError(error);
      if (readableMessage) {
        toast.error(readableMessage);
      }
    }
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
