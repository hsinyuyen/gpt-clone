import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminUser } from "@/server/adminAccess";
import {
  deleteLabToolAssets,
  listLabToolAssets,
  type CacheableLabToolKind,
} from "@/server/labToolCache";

const VALID_KINDS = new Set<CacheableLabToolKind>(["image", "music", "video"]);
const VALID_SCOPES = new Set(["asset", "kind", "worksheet"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === "GET") {
      await requireAdminUser(req.query.adminUserId);
      const worksheetId = typeof req.query.worksheetId === "string" ? req.query.worksheetId : "";
      const assets = await listLabToolAssets(worksheetId);
      return res.status(200).json({ worksheetId, assets });
    }

    if (req.method === "DELETE") {
      await requireAdminUser(req.body?.adminUserId);
      const scope = String(req.body?.scope || "");
      const kind = String(req.body?.kind || "") as CacheableLabToolKind;
      if (!VALID_SCOPES.has(scope)) {
        return res.status(400).json({ error: "scope must be asset, kind, or worksheet." });
      }
      if (scope !== "worksheet" && !VALID_KINDS.has(kind)) {
        return res.status(400).json({ error: "A valid kind is required." });
      }
      const result = await deleteLabToolAssets({
        worksheetId: String(req.body?.worksheetId || ""),
        scope: scope as "asset" | "kind" | "worksheet",
        kind: scope === "worksheet" ? undefined : kind,
        fileName: typeof req.body?.fileName === "string" ? req.body.fileName : undefined,
      });
      return res.status(result.failed.length > 0 ? 207 : 200).json(result);
    }

    res.setHeader("Allow", "GET, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /Admin (session|permission)/i.test(message) ? 403 : 400;
    return res.status(status).json({ error: message });
  }
}
