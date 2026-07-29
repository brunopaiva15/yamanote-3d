// Journal du pipeline : messages horodatés, chronométrage par phase et
// collecte des avertissements pour le rapport de build.

const t0 = process.hrtime.bigint();

function elapsed() {
  return Number(process.hrtime.bigint() - t0) / 1e9;
}

export function createReporter(name) {
  const warnings = [];
  const errors = [];
  const phases = [];
  let current = null;

  const stamp = () => `[${elapsed().toFixed(2)}s]`;

  return {
    name,
    info(msg) {
      console.log(`${stamp()} ${msg}`);
    },
    step(msg) {
      console.log(`${stamp()} · ${msg}`);
    },
    warn(msg) {
      warnings.push(msg);
      console.warn(`${stamp()} ⚠ ${msg}`);
    },
    error(msg) {
      errors.push(msg);
      console.error(`${stamp()} ✖ ${msg}`);
    },
    beginPhase(title) {
      if (current) this.endPhase();
      current = { title, startedAt: elapsed() };
      console.log(`\n${stamp()} ── ${title}`);
    },
    endPhase() {
      if (!current) return;
      const duration = elapsed() - current.startedAt;
      phases.push({ title: current.title, seconds: Math.round(duration * 1000) / 1000 });
      current = null;
    },
    /** Chronomètre une fonction asynchrone comme une phase nommée. */
    async phase(title, fn) {
      this.beginPhase(title);
      try {
        return await fn();
      } finally {
        this.endPhase();
      }
    },
    summary() {
      if (current) this.endPhase();
      return { phases, warnings, errors, totalSeconds: Math.round(elapsed() * 1000) / 1000 };
    },
  };
}

/** Formate un nombre d'octets. */
export function humanBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'n/a';
  const units = ['o', 'Ko', 'Mo', 'Go'];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(v >= 100 || u === 0 ? 0 : 1)} ${units[u]}`;
}

/** Erreur « attendue » du pipeline : affichée sans pile d'appels. */
export class PipelineError extends Error {
  constructor(message, hint) {
    super(hint ? `${message}\n  → ${hint}` : message);
    this.name = 'PipelineError';
    this.expected = true;
  }
}

/** Point d'entrée commun : imprime proprement les PipelineError. */
export async function runMain(fn) {
  try {
    await fn();
  } catch (err) {
    if (err instanceof PipelineError || err?.expected) {
      console.error(`\n✖ ${err.message}`);
    } else {
      console.error(`\n✖ Erreur inattendue :`);
      console.error(err);
    }
    process.exitCode = 1;
  }
}
