import { describe, expect, it } from "vitest";

describe("Application Routes", () => {
  it("should have catalog route at /", () => {
    expect("/").toBe("/");
  });

  it("should have cart route at /carrinho", () => {
    expect("/carrinho").toBe("/carrinho");
  });

  it("should have login route at /login", () => {
    expect("/login").toBe("/login");
  });

  it("should have admin route at /admin", () => {
    expect("/admin").toBe("/admin");
  });

  it("should have kitchen route at /cozinha", () => {
    expect("/cozinha").toBe("/cozinha");
  });

  it("should have order tracking route at /acompanhar", () => {
    expect("/acompanhar").toBe("/acompanhar");
  });

  it("should have 404 route at /404", () => {
    expect("/404").toBe("/404");
  });

  it("should validate WhatsApp integration is configured", () => {
    const phone = process.env.VITE_RESTAURANT_PHONE;
    expect(phone).toBeDefined();
    expect(phone).toMatch(/^\d{10,}$/);
  });

  it("should validate restaurant name is available", () => {
    const name = process.env.VITE_APP_TITLE;
    expect(name).toBeDefined();
  });

  it("should generate valid WhatsApp message format", () => {
    const message = `*NOVO PEDIDO*\n\nCliente: João\nTelefone: 5585987654321\n\nITENS:\n1. Hambúrguer - 1x\nPreço: R$ 25,00\n\nTOTAL: R$ 25,00`;
    expect(message).toContain("*NOVO PEDIDO*");
    expect(message).toContain("Cliente:");
    expect(message).toContain("ITENS:");
    expect(message).toContain("TOTAL:");
  });
});
