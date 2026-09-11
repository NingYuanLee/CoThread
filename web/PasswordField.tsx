import React, { useState } from "react";

function passwordLevel(password: string) {
  if (!password) return { key: "", label: "", bars: 0 };
  const kinds = [/[a-z]/.test(password), /[A-Z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length;
  if (password.length < 8 || kinds <= 1) return { key: "danger", label: "危险", bars: 1 };
  if (kinds === 2) return { key: "normal", label: "一般", bars: 2 };
  return { key: "safe", label: "安全", bars: 3 };
}

export function PasswordField({ label = "密码", name = "password", ...props }: {
  label?: string;
  name?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "name">) {
  const [password, setPassword] = useState("");
  const level = passwordLevel(password);
  return <div className="password-field">
    <label>{label}<input {...props} name={name} type="password" minLength={8} maxLength={200}
      onChange={(event) => { setPassword(event.target.value); props.onChange?.(event); }} /></label>
    <div className="password-strength" data-level={level.key} aria-live="polite">
      <span className={level.bars >= 1 ? "active" : ""} />
      <span className={level.bars >= 2 ? "active" : ""} />
      <span className={level.bars >= 3 ? "active" : ""} />
      <small>{password ? `密码强度：${level.label}` : "至少 8 位"}</small>
    </div>
  </div>;
}
