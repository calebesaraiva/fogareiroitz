import React, { createContext, useContext, useState, useEffect } from "react";

export interface CartItem {
  lineId: string;
  id: number;
  name: string;
  price: number;
  imageUrl?: string;
  quantity: number;
  observations: string;
  customization: string;
}

interface CartContextType {
  items: CartItem[];
  addToCart: (item: Omit<CartItem, "lineId">) => void;
  removeFromCart: (lineId: string) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  clearCart: () => void;
  cartCount: number;
  total: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const ensureLineId = (
    item: Omit<CartItem, "lineId"> & Partial<Pick<CartItem, "lineId">>
  ): CartItem => ({
    ...item,
    lineId: item.lineId || `cart-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    id: Number(item.id),
    price: Number(item.price),
    quantity: Math.max(1, Number(item.quantity) || 1),
    observations: item.observations ?? "",
    customization: item.customization ?? "completo",
  });

  // Load cart from localStorage on mount
  useEffect(() => {
    const savedCart = localStorage.getItem("cart");
    if (savedCart) {
      try {
        const parsed = JSON.parse(savedCart);
        if (Array.isArray(parsed)) {
          setItems(parsed.map(ensureLineId));
        }
      } catch (error) {
        console.error("Failed to load cart from localStorage:", error);
      }
    }
  }, []);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("cart", JSON.stringify(items));
  }, [items]);

  const addToCart = (newItem: Omit<CartItem, "lineId">) => {
    setItems((prevItems) => {
      const normalizedItem = ensureLineId(newItem);
      const existingItem = prevItems.find(
        (item) =>
          item.id === normalizedItem.id &&
          item.customization === normalizedItem.customization &&
          item.observations === normalizedItem.observations
      );

      if (existingItem) {
        return prevItems.map((item) =>
          item === existingItem
            ? { ...item, quantity: item.quantity + normalizedItem.quantity }
            : item
        );
      }

      return [...prevItems, normalizedItem];
    });
  };

  const removeFromCart = (lineId: string) => {
    setItems((prevItems) => prevItems.filter((item) => item.lineId !== lineId));
  };

  const updateQuantity = (lineId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(lineId);
      return;
    }

    setItems((prevItems) =>
      prevItems.map((item) =>
        item.lineId === lineId ? { ...item, quantity } : item
      )
    );
  };

  const clearCart = () => {
    setItems([]);
  };

  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        cartCount,
        total,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within CartProvider");
  }
  return context;
}
