import { useContext } from "react";
import { ToastContext } from "./ToastContextBase";

export const useToast = () => useContext(ToastContext);
