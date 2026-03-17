import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDVnab3BCfnlJH5cRCz_EqaHlP7yQUpK78",
  authDomain: "gpt-clone-68b9f.firebaseapp.com",
  projectId: "gpt-clone-68b9f",
  storageBucket: "gpt-clone-68b9f.firebasestorage.app",
  messagingSenderId: "436942056069",
  appId: "1:436942056069:web:8762675dfff7b7e92017ec",
  measurementId: "G-842KZYGN8Q",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);

// Firebase Storage
import { getStorage, ref, uploadString, getDownloadURL } from "firebase/storage";
const storage = getStorage(app);

export { db, doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs };
export { storage, ref, uploadString, getDownloadURL };
export default db;
