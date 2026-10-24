export interface OrderTrackingEvent {
  title: string;
  actorName: string;
  status: string;
  notes: string | null;
  createdAt: string;
}

export interface OrderTrackingTimelineInput {
  status: string;
  paymentStatus: string;
  deliveryStatus: string;
  deliveryOption: string | null;
  stockReserved: boolean;
  createdAt: string;
  updatedAt: string;
  events: OrderTrackingEvent[];
}

export interface OrderTrackingTimelineStage {
  title: string;
  state: "completed" | "current" | "upcoming" | "terminal";
  event: OrderTrackingEvent | null;
}

const STATUS_RANK: Record<string, number> = {
  new: 0,
  reviewed: 0,
  approved: 1,
  processing: 1,
  picking: 2,
  packing: 3,
  delivery: 4,
  completed: 5,
};

function matches(title: string, aliases: string[]) {
  const normalized = title.toLowerCase();
  return aliases.some((alias) => normalized.includes(alias));
}

export function buildOrderTrackingTimeline(input: OrderTrackingTimelineInput): OrderTrackingTimelineStage[] {
  const events = [...input.events].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
  const getEvent = (...aliases: string[]) => events.find((event) => matches(event.title, aliases)) ?? null;
  const createdEvent = getEvent("order created", "order placed") ?? {
    title: "Order Created",
    actorName: "",
    status: "completed",
    notes: null,
    createdAt: input.createdAt,
  };

  if (input.status === "cancelled" || input.status === "returned") {
    const terminalAliases = input.status === "cancelled"
      ? ["cancelled", "rejected"]
      : ["returned"];
    const terminalEvent = getEvent(...terminalAliases) ?? {
      title: input.status === "cancelled" ? "Order Cancelled" : "Order Returned",
      actorName: "",
      status: "completed",
      notes: null,
      createdAt: input.updatedAt,
    };
    const history = events.filter((event) => event !== createdEvent && !matches(event.title, ["order created", "order placed"]));
    if (!history.some((event) => matches(event.title, terminalAliases))) history.push(terminalEvent);
    return [
      { title: "Order Created", state: "completed", event: createdEvent },
      ...history.map((event) => ({
        title: event.title,
        state: matches(event.title, terminalAliases) ? "terminal" as const : "completed" as const,
        event,
      })),
    ];
  }

  const paymentEvent = getEvent("payment received", "payment recorded");
  const approvedEvent = getEvent("order approved", "status changed to approved");
  const reservedEvent = getEvent("stock reserved", "inventory reserved");
  const pickingEvent = getEvent("picking started", "status changed to picking");
  const packingEvent = getEvent("packing completed", "status changed to packing");
  const packingCompletedEvent = getEvent("packing completed");
  const pickup = /pickup|collection/i.test(input.deliveryOption ?? "");
  const transitEvent = pickup
    ? getEvent("ready for pickup", "ready for collection")
    : getEvent("out for delivery", "dispatched");
  const deliveredEvent = getEvent("order delivered", "delivered", "order completed");

  let rank = STATUS_RANK[input.status] ?? 0;
  if (pickingEvent) rank = Math.max(rank, 2);
  if (packingCompletedEvent) rank = Math.max(rank, 4);
  else if (packingEvent) rank = Math.max(rank, 3);
  if (transitEvent) rank = Math.max(rank, 4);
  if (deliveredEvent || input.deliveryStatus === "delivered") rank = Math.max(rank, 5);

  const stages: OrderTrackingTimelineStage[] = [
    { title: "Order Created", state: "completed", event: createdEvent },
  ];
  if (input.paymentStatus === "paid" || paymentEvent) {
    stages.push({ title: "Payment Received", state: "completed", event: paymentEvent });
  }

  stages.push({
    title: "Order Approved",
    state: rank >= 1 || approvedEvent ? "completed" : "current",
    event: approvedEvent,
  });

  if (input.stockReserved || reservedEvent) {
    stages.push({ title: "Inventory Reserved", state: "completed", event: reservedEvent });
  }

  stages.push(
    {
      title: "Picking",
      state: rank > 2 ? "completed" : rank === 2 ? "current" : "upcoming",
      event: pickingEvent,
    },
    {
      title: "Packing",
      state: rank > 3 ? "completed" : rank === 3 ? "current" : "upcoming",
      event: packingEvent,
    },
    {
      title: pickup ? "Ready for Pickup" : "Out for Delivery",
      state: rank > 4 ? "completed" : rank === 4 ? "current" : "upcoming",
      event: transitEvent,
    },
    {
      title: "Delivered",
      state: rank >= 5 ? "completed" : "upcoming",
      event: deliveredEvent,
    },
  );

  return stages;
}
