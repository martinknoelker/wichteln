import crypto from 'node:crypto';

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Zufällige Verteilung, bei der niemand seine eigene Angabe bekommt (Derangement)
export function derange(n) {
  if (n < 2) return [0];
  for (;;) {
    const a = shuffle([...Array(n).keys()]);
    if (a.every((v, i) => v !== i)) return a;
  }
}

// allowed[i] = Liste der Personen, die Person i beschenken darf (ohne sich selbst, ohne Ausgeschlossene).
// Liefert target[i] (jede Person genau einmal) oder null, wenn es keine passende Verteilung gibt.
export function assignTargets(allowed) {
  const n = allowed.length;
  const sets = allowed.map((l) => new Set(l));

  // 1) Rein zufällige Verteilungen probieren (gleichmäßig verteilt)
  for (let t = 0; t < 4000; t++) {
    const a = shuffle([...Array(n).keys()]);
    if (a.every((v, i) => sets[i].has(v))) return a;
  }

  // 2) Sonst: zufälliges Zuordnungsverfahren (findet eine Lösung, falls es überhaupt eine gibt)
  const giverOfTarget = Array(n).fill(-1);
  const tryGiver = (u, seen) => {
    for (const v of shuffle([...allowed[u]])) {
      if (seen[v]) continue;
      seen[v] = true;
      if (giverOfTarget[v] < 0 || tryGiver(giverOfTarget[v], seen)) {
        giverOfTarget[v] = u;
        return true;
      }
    }
    return false;
  };
  for (const u of shuffle([...Array(n).keys()])) {
    if (!tryGiver(u, Array(n).fill(false))) return null;
  }
  const target = Array(n).fill(-1);
  giverOfTarget.forEach((u, v) => { target[u] = v; });
  return target;
}

export const pick = (n) => crypto.randomInt(n);
