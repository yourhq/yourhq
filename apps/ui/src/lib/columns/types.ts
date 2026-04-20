import { ColumnDef } from "@tanstack/react-table";

export interface ColumnConfig<T> {
  id: string;
  label: string;
  defaultVisible: boolean;
  locked?: boolean;
  group: "standard" | "custom";
  columnDef: ColumnDef<T>;
}

export interface ColumnToggleItem {
  id: string;
  label: string;
  visible: boolean;
  locked: boolean;
  group: "standard" | "custom";
}
