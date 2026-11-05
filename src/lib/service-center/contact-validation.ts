export const serviceContactMethods = ["phone", "email", "sms", "whatsapp", "in_person", "other"] as const;
export const serviceContactDirections = ["incoming", "outgoing"] as const;
export const serviceContactOutcomes = ["completed", "no_answer", "left_message", "follow_up_needed", "other"] as const;

export type ServiceContactInput = {
  direction: (typeof serviceContactDirections)[number];
  method: (typeof serviceContactMethods)[number];
  outcome: (typeof serviceContactOutcomes)[number];
  details: string;
};

type ContactResult =
  | { ok: true; contact: ServiceContactInput }
  | { ok: false; error: string };

function isOneOf<T extends readonly string[]>(values: T, value: string): value is T[number] {
  return values.some((candidate) => candidate === value);
}

export function parseServiceContact(values: {
  direction: unknown;
  method: unknown;
  outcome: unknown;
  details: unknown;
}): ContactResult {
  const direction = typeof values.direction === "string" ? values.direction : "";
  const method = typeof values.method === "string" ? values.method : "";
  const outcome = typeof values.outcome === "string" ? values.outcome : "";
  const details = typeof values.details === "string" ? values.details.trim() : "";

  if (!isOneOf(serviceContactDirections, direction)) {
    return { ok: false, error: "Choose whether the customer contacted you or you contacted them." };
  }
  if (!isOneOf(serviceContactMethods, method)) {
    return { ok: false, error: "Choose a valid contact method." };
  }
  if (!isOneOf(serviceContactOutcomes, outcome)) {
    return { ok: false, error: "Choose a valid contact outcome." };
  }
  if (!details || details.length > 2000) {
    return { ok: false, error: "Enter contact details of up to 2,000 characters." };
  }

  return {
    ok: true,
    contact: {
      direction,
      method,
      outcome,
      details,
    },
  };
}
