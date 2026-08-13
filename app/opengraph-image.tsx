import { ImageResponse } from "next/og";

export const alt = "awesome-agent-oss - Open-source AI agent stack radar";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 78px",
        background: "#f4f5f2",
        color: "#17201c",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div
          style={{
            width: 54,
            height: 54,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 10,
            background: "#17201c",
            color: "#ffffff",
            fontSize: 28,
            fontWeight: 700,
          }}
        >
          A
        </div>
        <div style={{ display: "flex", fontSize: 30, fontWeight: 700 }}>
          awesome-agent-oss
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", color: "#16764a", fontSize: 22, fontWeight: 700 }}>
          OPEN-SOURCE AGENT RADAR
        </div>
        <div
          style={{
            display: "flex",
            maxWidth: 980,
            fontSize: 66,
            fontWeight: 700,
            lineHeight: 1.08,
          }}
        >
          Find the open-source stacks you need to build AI agents.
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 24,
          borderTop: "2px solid #d9ddd8",
          color: "#68716c",
          fontSize: 22,
        }}
      >
        <div style={{ display: "flex" }}>Curated repositories. Daily growth signals.</div>
        <div style={{ display: "flex", color: "#16764a", fontWeight: 700 }}>
          awesomeagent.vercel.app
        </div>
      </div>
    </div>,
    size,
  );
}
