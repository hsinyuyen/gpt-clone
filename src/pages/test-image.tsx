import { useState, useRef } from "react";

function buildUrl(prompt: string, params: Record<string, string>) {
  const encoded = encodeURIComponent(prompt);
  const base = `https://gen.pollinations.ai/image/${encoded}`;
  // Always include model=flux
  const fullParams = { model: "flux", ...params };
  const qs = new URLSearchParams(fullParams).toString();
  const directUrl = `${base}?${qs}`;
  // Route through proxy (adds Bearer auth server-side)
  return `/api/image-proxy?url=${encodeURIComponent(directUrl)}`;
}

interface TestResult {
  id: number;
  label: string;
  url: string;
  fetchStatus: "pending" | "ok" | "error";
  fetchError?: string;
  fetchTime?: number;
  imgStatus: "pending" | "loaded" | "error";
  imgTime?: number;
}

export default function TestImage() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [customPrompt, setCustomPrompt] = useState("cute chibi cat, children book illustration");
  const startTimes = useRef<Record<number, number>>({});

  const addTest = (label: string, url: string) => {
    const id = Date.now() + Math.random();
    startTimes.current[id] = Date.now();

    const result: TestResult = {
      id,
      label,
      url,
      fetchStatus: "pending",
      imgStatus: "pending",
    };

    setResults((prev) => [result, ...prev]);

    // Test with fetch
    fetch(url, { mode: "no-cors" })
      .then((res) => {
        // no-cors returns opaque response (status 0), so we can't read status
        // Just record that it didn't throw
        setResults((prev) =>
          prev.map((r) =>
            r.id === id
              ? { ...r, fetchStatus: "ok", fetchError: `opaque (no-cors)`, fetchTime: Date.now() - startTimes.current[id] }
              : r
          )
        );
      })
      .catch((err) => {
        setResults((prev) =>
          prev.map((r) =>
            r.id === id
              ? { ...r, fetchStatus: "error", fetchError: err.message, fetchTime: Date.now() - startTimes.current[id] }
              : r
          )
        );
      });

    // Also test with cors mode
    fetch(url)
      .then((res) => {
        setResults((prev) =>
          prev.map((r) =>
            r.id === id
              ? { ...r, fetchStatus: res.ok ? "ok" : "error", fetchError: `HTTP ${res.status} (cors)`, fetchTime: Date.now() - startTimes.current[id] }
              : r
          )
        );
      })
      .catch((err) => {
        setResults((prev) =>
          prev.map((r) =>
            r.id === id
              ? { ...r, fetchStatus: "error", fetchError: `${err.message} (cors)`, fetchTime: Date.now() - startTimes.current[id] }
              : r
          )
        );
      });

    return id;
  };

  const onImgLoad = (id: number) => {
    setResults((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, imgStatus: "loaded", imgTime: Date.now() - startTimes.current[id] } : r
      )
    );
  };

  const onImgError = (id: number) => {
    setResults((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, imgStatus: "error", imgTime: Date.now() - startTimes.current[id] } : r
      )
    );
  };

  const runParamTests = () => {
    const p = customPrompt;
    const seed = String(Math.floor(Math.random() * 9999));

    const variants: { label: string; params: Record<string, string> }[] = [
      { label: "no params", params: {} },
      { label: "512x512", params: { width: "512", height: "512" } },
      { label: "+nologo+seed", params: { width: "512", height: "512", nologo: "true", seed } },
    ];

    variants.forEach((v) => {
      addTest(`[${v.label}]`, buildUrl(p, v.params));
    });
  };

  const runSingleTest = () => {
    const seed = String(Math.floor(Math.random() * 9999));
    addTest(customPrompt, buildUrl(customPrompt, { width: "512", height: "512", nologo: "true", seed }));
  };

  const statusColor = (s: string) =>
    s === "ok" || s === "loaded" ? "#0f0" : s === "error" ? "red" : "#ff0";

  return (
    <div style={{ background: "#111", color: "#0f0", minHeight: "100vh", padding: 20, fontFamily: "monospace", fontSize: 12 }}>
      <h1 style={{ fontSize: 18, marginBottom: 12 }}>Pollinations Image Debug</h1>
      <p style={{ color: "#888", marginBottom: 12 }}>
        Each test runs both <b>fetch()</b> and <b>&lt;img&gt;</b> tag to see which method works.
      </p>

      {/* Controls */}
      <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 8, maxWidth: 700 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label>Prompt:</label>
          <input
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            style={{ flex: 1, background: "#222", color: "#0f0", border: "1px solid #0f0", padding: "4px 8px" }}
          />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={runSingleTest} style={{ background: "#0f0", color: "#000", padding: "6px 16px", cursor: "pointer", border: "none", fontWeight: "bold" }}>
            Test Single
          </button>
          <button onClick={runParamTests} style={{ background: "#ff0", color: "#000", padding: "6px 16px", cursor: "pointer", border: "none", fontWeight: "bold" }}>
            Test All Param Variants
          </button>
          <button onClick={() => setResults([])} style={{ background: "#333", color: "#fff", padding: "6px 16px", cursor: "pointer", border: "none" }}>
            Clear
          </button>
        </div>
      </div>

      {/* Results */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {results.map((r) => (
          <div key={r.id} style={{ border: "1px solid #333", padding: 10, display: "flex", gap: 12 }}>
            {/* Image preview via <img> tag */}
            <div style={{ width: 120, height: 120, flexShrink: 0, background: "#000", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" }}>
              <img
                src={r.url}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                onLoad={() => onImgLoad(r.id)}
                onError={() => onImgError(r.id)}
              />
              {r.imgStatus === "pending" && (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#000", color: "#555" }}>
                  Loading...
                </div>
              )}
            </div>

            {/* Info */}
            <div style={{ flex: 1, lineHeight: 1.8 }}>
              <div style={{ color: "#888" }}><b>Label:</b> {r.label}</div>
              <div>
                <b>fetch():</b>{" "}
                <span style={{ color: statusColor(r.fetchStatus) }}>{r.fetchStatus.toUpperCase()}</span>
                {r.fetchError && <span style={{ color: "#888" }}> — {r.fetchError}</span>}
                {r.fetchTime != null && <span style={{ color: "#555" }}> ({(r.fetchTime / 1000).toFixed(1)}s)</span>}
              </div>
              <div>
                <b>&lt;img&gt;:</b>{" "}
                <span style={{ color: statusColor(r.imgStatus) }}>{r.imgStatus.toUpperCase()}</span>
                {r.imgTime != null && <span style={{ color: "#555" }}> ({(r.imgTime / 1000).toFixed(1)}s)</span>}
              </div>
              <div style={{ color: "#444", wordBreak: "break-all", fontSize: 10, marginTop: 2 }}>
                <a href={r.url} target="_blank" rel="noreferrer" style={{ color: "#444" }}>{r.url}</a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
