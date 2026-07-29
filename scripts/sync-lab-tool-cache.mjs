import fs from "fs/promises";
import path from "path";
import { initializeApp, getApps } from "firebase/app";
import { doc, getFirestore, setDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDVnab3BCfnlJH5cRCz_EqaHlP7yQUpK78",
  authDomain: "gpt-clone-68b9f.firebaseapp.com",
  projectId: "gpt-clone-68b9f",
  storageBucket: "gpt-clone-68b9f.firebasestorage.app",
  messagingSenderId: "436942056069",
  appId: "1:436942056069:web:8762675dfff7b7e92017ec",
  measurementId: "G-842KZYGN8Q",
};

const CACHE_ROOT = path.join(process.cwd(), ".lab-tool-cache");
const CLOUD_CACHE_ROOT = "lab-tool-cache";
const KINDS = ["image", "music", "video"];

const app = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApps()[0];
const db = getFirestore(app);
const storage = getStorage(app);

const normalizeWorksheetId = (worksheetId = "S3W01") =>
  worksheetId.toUpperCase().replace(/[-_\s]/g, "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "S3W01";

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function withoutUndefined(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  );
}

async function writeIndex(worksheetId, kind, entries) {
  const normalizedWorksheetId = normalizeWorksheetId(worksheetId);
  const payload = {
    worksheetId: normalizedWorksheetId,
    kind,
    entries: entries.map(withoutUndefined),
    updatedAt: new Date().toISOString(),
    version: 1,
  };

  const refs = [
    doc(db, "labToolCache", normalizedWorksheetId, "kinds", kind),
    doc(db, "system", `labToolCache_${normalizedWorksheetId}_${kind}`),
  ];

  let wrote = false;
  for (const target of refs) {
    try {
      await setDoc(target, payload, { merge: true });
      console.log(`[Firestore] wrote ${target.path}`);
      wrote = true;
    } catch (error) {
      console.warn(`[Firestore] failed ${target.path}:`, error.message || error);
    }
  }

  if (!wrote) {
    throw new Error(`No Firestore index write succeeded for ${normalizedWorksheetId}/${kind}`);
  }
}

async function syncKind(worksheetId, kind) {
  const normalizedWorksheetId = normalizeWorksheetId(worksheetId);
  const dir = path.join(CACHE_ROOT, normalizedWorksheetId, kind);
  const indexPath = path.join(dir, "index.json");
  const index = await readJson(indexPath, []);
  if (!Array.isArray(index) || index.length === 0) {
    return { kind, count: 0 };
  }

  const nextEntries = [];
  for (const entry of index) {
    const fileName = path.basename(entry.fileName || "");
    if (!fileName) continue;

    const fullPath = path.join(dir, fileName);
    const buffer = await fs.readFile(fullPath);
    const storagePath = `${CLOUD_CACHE_ROOT}/${normalizedWorksheetId}/${kind}/${fileName}`;
    const storageRef = ref(storage, storagePath);

    await uploadBytes(storageRef, buffer, {
      contentType: entry.mimeType || "application/octet-stream",
    });
    const downloadUrl = await getDownloadURL(storageRef);

    nextEntries.push({
      ...entry,
      fileName,
      size: buffer.length,
      storagePath,
      downloadUrl,
      syncedAt: new Date().toISOString(),
    });

    console.log(`[Storage] ${kind}/${fileName} (${Math.round(buffer.length / 1024)} KB)`);
  }

  await fs.writeFile(indexPath, JSON.stringify(nextEntries, null, 2), "utf8");
  await writeIndex(normalizedWorksheetId, kind, nextEntries);
  return { kind, count: nextEntries.length };
}

async function main() {
  const worksheetId = normalizeWorksheetId(process.argv[2] || "S3W01");
  const results = [];
  for (const kind of KINDS) {
    results.push(await syncKind(worksheetId, kind));
  }
  console.log("[Done]", JSON.stringify({ worksheetId, results }, null, 2));
}

main().catch((error) => {
  console.error("[Failed]", error);
  process.exitCode = 1;
}).finally(() => {
  process.exit(process.exitCode || 0);
});
