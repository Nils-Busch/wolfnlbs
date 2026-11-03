// Kniffel: Felder und Punktwertung (reine Logik, auch in Node testbar).

export const KN_CATS = [
  { key: "ones", name: "Einer", upper: 1 },
  { key: "twos", name: "Zweier", upper: 2 },
  { key: "threes", name: "Dreier", upper: 3 },
  { key: "fours", name: "Vierer", upper: 4 },
  { key: "fives", name: "Fünfer", upper: 5 },
  { key: "sixes", name: "Sechser", upper: 6 },
  { key: "three", name: "Dreierpasch" },
  { key: "four", name: "Viererpasch" },
  { key: "full", name: "Full House" },
  { key: "small", name: "Kleine Straße" },
  { key: "large", name: "Große Straße" },
  { key: "kniffel", name: "Kniffel" },
  { key: "chance", name: "Chance" },
];
export function knScore(key, dice) {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) counts[d]++;
  const sum = dice.reduce((a, b) => a + b, 0);
  const max = Math.max(...counts);
  const has = (run) => run.every((v) => counts[v] > 0);
  const cat = KN_CATS.find((c) => c.key === key);
  if (cat?.upper) return counts[cat.upper] * cat.upper;
  switch (key) {
    case "three": return max >= 3 ? sum : 0;
    case "four": return max >= 4 ? sum : 0;
    case "full": return counts.includes(3) && counts.includes(2) ? 25 : max === 5 ? 25 : 0;
    case "small": return has([1, 2, 3, 4]) || has([2, 3, 4, 5]) || has([3, 4, 5, 6]) ? 30 : 0;
    case "large": return has([1, 2, 3, 4, 5]) || has([2, 3, 4, 5, 6]) ? 40 : 0;
    case "kniffel": return max === 5 ? 50 : 0;
    case "chance": return sum;
    default: return 0;
  }
}
export function knTotals(sheet) {
  const upper = KN_CATS.filter((c) => c.upper).reduce((a, c) => a + (sheet[c.key] || 0), 0);
  const bonus = upper >= 63 ? 35 : 0;
  const lower = KN_CATS.filter((c) => !c.upper).reduce((a, c) => a + (sheet[c.key] || 0), 0);
  return { upper, bonus, lower, total: upper + bonus + lower };
}
