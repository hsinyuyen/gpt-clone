import { initializeApp, getApps } from "firebase/app";
import { getFirebaseConfig } from "@/config/firebaseConfig";
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
  onSnapshot,
  runTransaction,
  orderBy,
  limit as firestoreLimit,
  arrayUnion,
} from "firebase/firestore";

const app =
  getApps().length === 0 ? initializeApp(getFirebaseConfig()) : getApps()[0];
const db = getFirestore(app);

// Firebase Storage
import { getStorage, ref, uploadString, getDownloadURL } from "firebase/storage";
const storage = getStorage(app);

export { db, doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs, onSnapshot };
export { runTransaction, orderBy, firestoreLimit, arrayUnion };
export { storage, ref, uploadString, getDownloadURL };
export default db;
