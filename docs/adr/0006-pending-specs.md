# 0006 — Failing specs for unbuilt modules, kept out of the required suite

**Status:** accepted · **Departs from the plan:** no

## Decision

Each unbuilt core module ships with its interface, a stub that throws
`NotImplementedError`, and a spec named `test/modules/<module>.pending.test.ts`
that describes the behaviour the plan requires.

- `pnpm test` runs `*.test.ts` and excludes `*.pending.test.ts`. It must be green.
- `pnpm test:pending` runs only the pending specs. It is expected to be red.
- CI runs both; the pending job is `continue-on-error` and never blocks a merge.
- Implementing a module means making its spec pass and renaming it to
  `<module>.test.ts`, which moves it into the required suite for good.

## Why

The prompt asks for failing tests and for CI that runs on every push. Both hold
only if "red because unbuilt" is distinguishable from "red because broken". The
alternatives were worse: `it.todo` describes nothing, and `it.fails` turns a
missing feature into a green tick.

## Consequences

- The count of failing pending specs is a rough, honest progress measure.
- A pending spec is a draft of the contract. If building the module shows the spec
  is wrong, change the spec and say why — do not bend the code to a mistaken test.
