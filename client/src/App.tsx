import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { CartProvider } from "./contexts/CartContext";
import { GlobalLoadingProvider } from "./contexts/GlobalLoadingContext";
import Catalog from "./pages/Catalog";
import Cart from "./pages/Cart";
import Login from "./pages/Login";
import AdminPanel from "./pages/AdminPanel";
import KitchenPanel from "./pages/KitchenPanel";
import OrderTracking from "./pages/OrderTracking";
import CashierPanel from "./pages/CashierPanel";
import ShowcaseBoard from "./pages/ShowcaseBoard";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Catalog} />
      <Route path="/carrinho" component={Cart} />
      <Route path="/acompanhar" component={OrderTracking} />
      <Route path="/login" component={Login} />
      <Route path="/admin" component={AdminPanel} />
      <Route path="/cozinha" component={KitchenPanel} />
      <Route path="/garcom" component={KitchenPanel} />
      <Route path="/caixa" component={CashierPanel} />
      <Route path="/painel-clientes" component={ShowcaseBoard} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <GlobalLoadingProvider>
          <CartProvider>
            <TooltipProvider>
              <Toaster />
              <Router />
            </TooltipProvider>
          </CartProvider>
        </GlobalLoadingProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
