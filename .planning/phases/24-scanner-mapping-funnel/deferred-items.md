# Deferred Items - Phase 24 Scanner + Mapping Funnel

## Plan 01

- **Pre-existing failing tests (out of scope):** `test/unit/handlers/gherkinStructureDiagnostics.test.ts` (7 tests) fails with `TypeError: featureParser_1.FeatureParseError is not a constructor` / `Cannot stub non-existent property getFeatureParseErrors`. These tests reference a `FeatureParseError` class and `getFeatureParseErrors` function that do not exist in the current `src/parsers/featureParser.ts` - they appear to belong to a not-yet-implemented feature from a different/future phase. Confirmed unrelated to Plan 01's changes by temporarily removing `src/parsers/executeStepsParser.ts` and its test file and re-running the suite (same 7 failures occurred). Not fixed per SCOPE BOUNDARY (pre-existing failure unrelated to this plan's files). Needs its own investigation/plan.
