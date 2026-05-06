import { createContext } from "react";

export const ConfirmContext = createContext({
  confirmar: async () => false,
});
