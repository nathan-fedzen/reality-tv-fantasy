"use client";

export default function DevModeBanner() {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS !== "true"
  ) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: "linear-gradient(90deg, #7c2d12, #dc2626)",
        color: "white",
        textAlign: "center",
        padding: "6px 12px",
        fontSize: "12px",
        fontWeight: 600,
        letterSpacing: "0.05em",
      }}
    >
      DEV MODE — AUTH BYPASS ENABLED
    </div>
  );
}
