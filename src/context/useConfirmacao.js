import { useContext } from "react";
import { ConfirmContext } from "./ConfirmContextBase";

export const useConfirmacao = () => useContext(ConfirmContext);
