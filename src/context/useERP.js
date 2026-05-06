import { useContext } from "react";
import { ERPContext } from "./ERPContextBase";

export const useERP = () => useContext(ERPContext);
