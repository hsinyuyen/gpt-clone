import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminUser } from "@/server/adminAccess";
import {
  deleteLabToolAssets,
  listLabToolAssets,
  type CacheableLabToolKind,
} from "@/server/labToolCache";

const VALID_KINDS = new Set<CacheableLabToolKind>(["image", "music", "video"]);
const VALID_SCOPES = new Set(["asset", "kind", "worksheet"]);

function readJsonBody(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }

  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // The validation below returns a clear client error for malformed requests.
    }
  }

  return {};
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === "GET") {
      await requireAdminUser(req.query.adminUserId, req.query.adminUsername);
      const worksheetId = typeof req.query.worksheetId === "string" ? req.query.worksheetId : "";
      const assets = await listLabToolAssets(worksheetId);
      return res.status(200).json({ worksheetId, assets });
    }

    if (req.method === "DELETE" || req.method === "POST") {
      const body = readJsonBody(req.body);
      if (req.method === "POST" && body.action !== "delete") {
        return res.status(400).json({ error: "action must be delete." });
      }
      await requireAdminUser(body.adminUserId, body.adminUsername);
      const scope = String(body.scope || "");
      const kind = String(body.kind || "") as CacheableLabToolKind;
      const worksheetId = typeof body.worksheetId === "string" ? body.worksheetId.trim() : "";
      const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
      if (!VALID_SCOPES.has(scope)) {
        return res.status(400).json({ error: "scope must be asset, kind, or worksheet." });
      }
      if (!worksheetId) {
        return res.status(400).json({ error: "worksheetId is required." });
      }
      if (scope !== "worksheet" && !VALID_KINDS.has(kind)) {
        return res.status(400).json({ error: "A valid kind is required." });
      }
      if (scope === "asset" && !fileName) {
        return res.status(400).json({ error: "fileName is required when deleting one asset." });
      }
      const result = await deleteLabToolAssets({
        worksheetId,
        scope: scope as "asset" | "kind" | "worksheet",
        kind: scope === "worksheet" ? undefined : kind,
        fileName: scope === "asset" ? fileName : undefined,
      });
      return res.status(result.failed.length > 0 ? 207 : 200).json(result);
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /Admin (session|permission)/i.test(message) ? 403 : 400;
    return res.status(status).json({ error: message });
  }
}
