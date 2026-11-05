export type ServiceIntakeDetails = {
  conditionOnArrival: string;
  accessories: string[];
  confirmedBy: string;
  confirmedAs: "customer" | "authorized_representative";
};

type IntakeResult =
  | { ok: true; intake: ServiceIntakeDetails }
  | { ok: false; error: string };

export function parseServiceIntake(values: {
  conditionOnArrival: unknown;
  accessories: unknown;
  confirmedBy: unknown;
  confirmedAs: unknown;
  acknowledged: unknown;
}): IntakeResult {
  const conditionOnArrival = typeof values.conditionOnArrival === "string" ? values.conditionOnArrival.trim() : "";
  const confirmedBy = typeof values.confirmedBy === "string" ? values.confirmedBy.trim() : "";
  const confirmedAs = values.confirmedAs;
  const accessoriesText = typeof values.accessories === "string" ? values.accessories : "";
  const accessories = accessoriesText.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);

  if (!conditionOnArrival || conditionOnArrival.length > 1000) {
    return { ok: false, error: "Record the equipment condition at intake (up to 1,000 characters)." };
  }
  if (accessories.length > 20 || accessories.some((item) => item.length > 80)) {
    return { ok: false, error: "Enter up to 20 accessories, with no more than 80 characters per item." };
  }
  if (!confirmedBy || confirmedBy.length > 120) {
    return { ok: false, error: "Enter the name of the customer or representative confirming intake (up to 120 characters)." };
  }
  if (confirmedAs !== "customer" && confirmedAs !== "authorized_representative") {
    return { ok: false, error: "Select whether the intake was confirmed by the customer or an authorized representative." };
  }
  if (values.acknowledged !== "on") {
    return { ok: false, error: "Confirm that the customer or representative reviewed and acknowledged the recorded intake details." };
  }

  return {
    ok: true,
    intake: { conditionOnArrival, accessories, confirmedBy, confirmedAs },
  };
}
