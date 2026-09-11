import nodemailer from "nodemailer";

let transport;
function mailTransport() {
  if (transport) return transport;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass || !process.env.EMAIL_FROM)
    throw new Error("邮件服务尚未配置");
  transport = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  return transport;
}

const purposeNames = { register: "注册账号", bind: "绑定邮箱", recover: "重置密码" };
export async function sendVerificationEmail({ email, code, purpose }) {
  const action = purposeNames[purpose] || "验证邮箱";
  const result = await mailTransport().sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: `共序 ${action}验证码`,
    text: `你的共序${action}验证码是：${code}\n\n验证码 10 分钟内有效，请勿转发。`,
    html: `<p>你的共序${action}验证码是：</p><p style="font-size:24px;font-weight:700;letter-spacing:4px">${code}</p><p>验证码 10 分钟内有效，请勿转发。</p>`,
  });
  const accepted = (result.accepted || []).map((value) => String(value).toLowerCase());
  if (!accepted.includes(email.toLowerCase())) throw new Error("收件服务器未接受验证码邮件");
  return { status: "accepted", messageId: result.messageId };
}
