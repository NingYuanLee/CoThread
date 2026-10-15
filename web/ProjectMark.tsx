import { useState } from "react";

export function ProjectMark({
  name,
  image,
  size = 18,
}: {
  name: string;
  image?: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const letter = name.trim()[0] || "项";
  const show = Boolean(image) && !failed;
  return (
    <span
      className="project-mark"
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.42)) }}
      aria-hidden="true"
    >
      {show ? (
        <img src={image || ""} alt="" onError={() => setFailed(true)} />
      ) : (
        letter
      )}
    </span>
  );
}
