import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#171412",
          borderRadius: "40px",
        }}
      >
        <div
          style={{
            width: "130px",
            height: "130px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#ea580c",
            borderRadius: "26px",
            transform: "rotate(-4deg)",
          }}
        >
          <svg
            width="80"
            height="80"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ffffff"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m12 14-1 1" />
            <path d="m13.75 18.25-1.25 1.42" />
            <path d="M17.775 5.654a15.68 15.68 0 0 0-12.121 12.12" />
            <path d="M18.8 9.3a1 1 0 0 0 2.1 7.7" />
            <path d="M21.964 20.732a1 1 0 0 1-1.232 1.232l-18-5a1 1 0 0 1-.695-1.232A19.68 19.68 0 0 1 15.732 2.037a1 1 0 0 1 1.232.695z" />
          </svg>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
