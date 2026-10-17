export type RecordEntity = "companies" | "contacts" | "technicians" | "categories";
export async function inspectRecord() {
  return { references: [], canDelete: true, activeTickets: 0 };
}
export async function archiveRecord() {
  throw new Error("Operação administrativa indisponível no harness");
}
export async function deleteRecord() {
  throw new Error("Operação administrativa indisponível no harness");
}
export async function restoreRecord() {
  throw new Error("Operação administrativa indisponível no harness");
}
