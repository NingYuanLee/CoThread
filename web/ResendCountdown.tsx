import React, { useEffect, useState } from "react";

export function ResendCountdown({ sentAt, onResend }: { sentAt: number; onResend: () => void }) {
  const [remaining, setRemaining] = useState(60);
  useEffect(() => {
    const update = () => setRemaining(Math.max(0, Math.ceil((sentAt + 60000 - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [sentAt]);
  return <button type="button" className="text-action" disabled={remaining > 0} onClick={onResend}>
    {remaining > 0 ? `${remaining} 秒后可重新发送` : "重新发送验证码"}
  </button>;
}
