const WEEKDAYS = {
  Sun: "星期日",
  Mon: "星期一",
  Tue: "星期二",
  Wed: "星期三",
  Thu: "星期四",
  Fri: "星期五",
  Sat: "星期六",
};

function part(parts, type) {
  return parts.find((item) => item.type === type)?.value ?? "";
}

/** 把一个时刻格式化成北京时间。服务器在哪个时区都不影响结果。 */
export function beijingNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);
  let hour = part(parts, "hour");
  if (hour === "24") hour = "00";
  const weekday = WEEKDAYS[part(parts, "weekday")] || part(parts, "weekday");
  return [
    part(parts, "year"),
    "-",
    part(parts, "month").padStart(2, "0"),
    "-",
    part(parts, "day").padStart(2, "0"),
    " ",
    hour.padStart(2, "0"),
    ":",
    part(parts, "minute").padStart(2, "0"),
    ":",
    part(parts, "second").padStart(2, "0"),
    " ",
    weekday,
  ].join("");
}

export function beijingClockText(date = new Date()) {
  return (
    "当前时刻：" +
    beijingNow(date) +
    "（北京时间）。被问到现在几点、今天几号或星期几时，直接用这一行，不要换算成别的时区，也不要声称没有时钟。"
  );
}
