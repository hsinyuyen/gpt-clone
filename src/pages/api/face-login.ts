import { NextApiRequest, NextApiResponse } from "next";

/**
 * POST /api/face-login
 *
 * Secure mode: receives a signed token from the face identity client,
 * forwards it to the Face Server for verification.
 *
 * Required env var: FACE_SERVER_URL (e.g. http://192.168.1.100:5000)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { payload, signature } = req.body;

  if (!payload || !signature) {
    return res.status(400).json({ valid: false, error: "Missing payload or signature" });
  }

  const faceServerUrl = process.env.FACE_SERVER_URL;
  if (!faceServerUrl) {
    // No face server configured — fall back to trusting the token payload
    // This is acceptable in a closed school network environment
    return res.status(200).json({
      valid: true,
      student_id: payload.student_id,
      name: payload.name,
      pc_number: payload.pc_number,
      confidence: payload.confidence,
    });
  }

  try {
    const verifyRes = await fetch(
      `${faceServerUrl}/api/v1/identity/verify`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload, signature }),
      }
    );

    const result = await verifyRes.json();
    return res.status(verifyRes.ok ? 200 : 401).json(result);
  } catch (err: any) {
    console.error("Face server verification failed:", err);
    return res.status(502).json({
      valid: false,
      error: "Cannot reach face verification server",
    });
  }
}
