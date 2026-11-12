// The mutants of tests/mutants.mjs, for the script that runs them
// (scripts/run-mutants.mjs) and the unit test that keeps the list in step with
// the code (tests/unit/mutants.test.mjs).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** How often `find` occurs in `text`. */
const times = (text, find) => (find ? text.split(find).length - 1 : 0);

/**
 * What is wrong with the list, as lines to print; none for a list that is in
 * step with the project in `root`. Each mutant needs a name of its own, a
 * text to take out that is in its file exactly once, another text in its
 * place, and a test that is in its file by name.
 */
export function problemsOf(mutants, root) {
  const out = [];
  const seen = new Set();
  for (const mutant of mutants) {
    const say = (what) => out.push(`"${mutant.name}": ${what}`);
    if (seen.has(mutant.name)) say('another mutant has this name');
    seen.add(mutant.name);
    for (const [file, find, put] of mutant.change) {
      if (!existsSync(join(root, file))) say(`${file} is missing`);
      else {
        const n = times(readFileSync(join(root, file), 'utf8'), find);
        if (n !== 1) say(`the text to take out is in ${file} ${n} times, not once: ${JSON.stringify(find.slice(0, 80))}`);
      }
      if (find === put) say(`it puts back what it takes out of ${file}`);
    }
    const { kind, file, name } = mutant.fails;
    if (kind === 'regressions') continue;
    if (!existsSync(join(root, file))) say(`its test's file ${file} is missing`);
    else if (!readFileSync(join(root, file), 'utf8').includes(name)) say(`${file} has no test with "${name}" in its name`);
  }
  return out;
}

/** Make the mutant's change in the copy of the project in `root`; returns a function that takes it back. */
export function applyTo(root, mutant) {
  const before = new Map();
  for (const [file, find, put] of mutant.change) {
    const path = join(root, file);
    const text = readFileSync(path, 'utf8');
    if (!before.has(path)) before.set(path, text);
    if (times(text, find) !== 1) throw new Error(`"${mutant.name}": the text to take out is not in ${file} exactly once`);
    writeFileSync(path, text.replace(find, () => put));
  }
  return () => {
    for (const [path, text] of before) writeFileSync(path, text);
  };
}
