import OrderTrackerCard from "@/components/OrderTrackerCard";
import RestaurantHeader from "@/components/RestaurantHeader";
import { Button } from "@/components/ui/button";
import { useGlobalLoading } from "@/contexts/GlobalLoadingContext";
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

export default function OrderTracking() {
  const [, setLocation] = useLocation();
  const { pulseLoading } = useGlobalLoading();

  return (
    <div className="mothers-day-shell min-h-screen bg-background">
      <RestaurantHeader
        showCart={false}
        title="Acompanhe seu pedido"
      />

      <main className="container mx-auto px-4 py-6 md:py-8">
        <div className="mb-6 flex justify-start">
          <Button
            variant="outline"
            className="gap-2"
            onClick={async () => {
              await pulseLoading("Voltando ao cardápio", 950);
              setLocation("/");
            }}
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao cardápio
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <OrderTrackerCard />
        </div>
      </main>
    </div>
  );
}
