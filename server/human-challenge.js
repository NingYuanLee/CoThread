import { randomInt } from "node:crypto";

const characters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
const colors = ["#355f4b", "#315e78", "#7a493f", "#5f527d", "#49633d"];

const pick = (items) => items[randomInt(0, items.length)];

export function createHumanChallenge() {
  const text = Array.from({ length: 5 }, () => pick(characters)).join("");
  const glyphs = [...text].map((character, index) => {
    const x = 19 + index * 28 + randomInt(-2, 3);
    const y = 33 + randomInt(-3, 4);
    const rotation = randomInt(-18, 19);
    return `<text x="${x}" y="${y}" fill="${pick(colors)}" font-family="Arial, sans-serif" font-size="27" font-weight="700" transform="rotate(${rotation} ${x} ${y})">${character}</text>`;
  }).join("");
  const noise = Array.from({ length: 3 }, () => {
    const startY = randomInt(5, 46);
    const endY = randomInt(5, 46);
    const controlY = randomInt(2, 49);
    return `<path d="M2 ${startY} Q75 ${controlY} 148 ${endY}" stroke="${pick(colors)}" stroke-width="1.2" opacity="0.55" fill="none"/>`;
  }).join("");
  const dots = Array.from({ length: 12 }, () =>
    `<circle cx="${randomInt(3, 148)}" cy="${randomInt(3, 48)}" r="${randomInt(1, 3)}" fill="${pick(colors)}" opacity="0.45"/>`,
  ).join("");
  return {
    text,
    data: `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="50" viewBox="0 0 150 50"><rect width="150" height="50" fill="#f5f6f2"/>${dots}${glyphs}${noise}</svg>`,
  };
}
