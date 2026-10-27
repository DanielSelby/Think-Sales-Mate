import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/communication/providers", () => ({
  deliverMessage: vi.fn(),
}));

import { deliverMessage } from "@/lib/communication/providers";
import { sendRestaurantOrderEmail, sendRestaurantReservationEmail } from "@/lib/restaurant/order-emails";

describe("sendRestaurantOrderEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("sends a status-specific email with the branch and order number", async () => {
    vi.stubEnv("SITE_URL", "https://restaurant.example");
    vi.mocked(deliverMessage).mockResolvedValue({ sent: true, provider: "resend" });

    await expect(sendRestaurantOrderEmail({
      email: "customer@example.com",
      orderNumber: 42,
      branchName: "Central Branch",
      status: "ready",
      trackingToken: "a-token",
    })).resolves.toEqual({ sent: true, provider: "resend" });

    expect(deliverMessage).toHaveBeenCalledWith({
      channel: "Email",
      recipient: "customer@example.com",
      subject: "Your order is ready #42",
      content: "Your order is ready for pickup or delivery.\n\nCentral Branch\nOrder #42\nTrack your order: https://restaurant.example/restaurant-order/track/a-token",
    });
  });

  it("returns provider failures for the caller to surface", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(deliverMessage).mockResolvedValue({
      sent: false,
      provider: "none",
      reason: "No email provider is configured.",
    });

    await expect(sendRestaurantOrderEmail({
      email: "customer@example.com",
      orderNumber: 42,
      branchName: "Central Branch",
      status: "received",
    })).resolves.toMatchObject({
      sent: false,
      reason: "No email provider is configured.",
    });
  });

  it("includes the private reservation link in customer confirmation emails", async () => {
    vi.stubEnv("SITE_URL", "https://restaurant.example");
    vi.mocked(deliverMessage).mockResolvedValue({ sent: true, provider: "resend" });

    await sendRestaurantReservationEmail({
      email: "guest@example.com",
      guestName: "Guest",
      partySize: 4,
      startsAt: "2026-10-28T18:00:00.000Z",
      branchName: "Central Branch",
      confirmationToken: "reservation-token",
      status: "confirmed",
    });

    expect(deliverMessage).toHaveBeenCalledWith(expect.objectContaining({
      channel: "Email",
      recipient: "guest@example.com",
      subject: "Reservation confirmed",
      content: expect.stringContaining("https://restaurant.example/restaurant-reservation/confirmation/reservation-token"),
    }));
  });
});
