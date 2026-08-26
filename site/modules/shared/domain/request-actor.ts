export type RequestActor =
  | { type: "ANONYMOUS" }
  | { type: "CUSTOMER" | "ADMIN" | "SERVICE" | "SYSTEM"; id: string };
