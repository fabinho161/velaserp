import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";



// Configuração do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDvEo36PDfHOcLXRmODMtmo0sILYL4LcKY",
  authDomain: "velaserp-93508.firebaseapp.com",
  projectId: "velaserp-93508",
  storageBucket: "velaserp-93508.firebasestorage.app",
  messagingSenderId: "798801756160",
  appId: "1:798801756160:web:b159a598b0ef670919d8e5"
};

// Inicializa Firebase
export const app = initializeApp(firebaseConfig);



// 🔥 EXPORTA ISSO (ESSENCIAL)
export const auth = getAuth(app);
export const db = getFirestore(app);


// 🔹 exportar storage para upload de arquivos
export const storage = getStorage(app);

// 🔹 exportar functions para chamadas de funções em nuvem
