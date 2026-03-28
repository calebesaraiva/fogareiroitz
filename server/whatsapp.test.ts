import { describe, expect, it } from "vitest";

describe("WhatsApp Configuration", () => {
  it("should have VITE_RESTAURANT_PHONE environment variable set", () => {
    const phone = process.env.VITE_RESTAURANT_PHONE;
    expect(phone).toBeDefined();
    expect(phone).toBeTruthy();
  });

  it("should have valid phone format (digits only, at least 10 digits)", () => {
    const phone = process.env.VITE_RESTAURANT_PHONE;
    expect(phone).toMatch(/^\d{10,}$/);
  });

  it("should generate valid WhatsApp URL", () => {
    const phone = process.env.VITE_RESTAURANT_PHONE;
    const testMessage = "Teste de mensagem";
    const encodedMessage = encodeURIComponent(testMessage);
    const whatsappUrl = `https://wa.me/${phone}?text=${encodedMessage}`;
    
    expect(whatsappUrl).toContain("https://wa.me/");
    expect(whatsappUrl).toContain(phone);
    expect(whatsappUrl).toContain("?text=");
  });
});
