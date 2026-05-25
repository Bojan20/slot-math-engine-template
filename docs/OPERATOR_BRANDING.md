# Per-Operator Branding (W213 Faza 700.1)

The slot-math-engine pitch toolchain ships with a manifest-driven branding
engine that swaps every reference to "Vendor B" / "Vendor B" / "Vendor B" with
the equivalent token for the target operator. Same content, same proof
artifacts — different cover.

Source-of-truth manifests live in `scripts/pitch/operators/*.json`.

## Available operators

| operatorId  | Display name     | Tier         | HQ                          |
|-------------|------------------|--------------|-----------------------------|
| `lw`        | Vendor B              | Tier-1       | Las Vegas, NV               |
| `aristocrat`| Vendor C       | Tier-1       | Sydney, Australia           |
| `igt`       | Vendor A              | Tier-1       | London, UK / Providence, RI |
| `pragmatic` | Vendor E   | Tier-1       | Sliema, Malta               |
| `evolution` | Evolution        | Tier-1       | Stockholm, Sweden           |
| `playtech`  | Vendor F         | Tier-1       | Douglas, Isle of Man        |
| `hacksaw`   | Hacksaw Gaming   | Tier-2       | Stockholm, Sweden           |

`_template.json` is the empty starter for adding new operators.

## Manifest schema

Each manifest is a flat JSON object validated by
`validateOperatorManifest()` in `scripts/pitch/operator-branding.mjs`.

Required fields (21 total):

| Field                | Type             | Notes                                          |
|----------------------|------------------|------------------------------------------------|
| `operatorId`         | lower-case slug  | matches the filename                           |
| `displayName`        | string           | short brand label                              |
| `legalName`          | string           | "_Inc._ / _PLC_ / _AB_" form                   |
| `shortName`          | string           | medium-length brand label                      |
| `hqLocation`         | string           | "City, Country" form                           |
| `tickerSymbol`       | string \| null   | "Vendor B", "ALL.AX" — null for private             |
| `primaryColor`       | hex CSS color    | swaps `#22d3ee` (Vendor B cyan) in HTML             |
| `accentColor`        | hex CSS color    | swaps `#0e7490`                                |
| `industryRank`       | int \| null      | 1 = largest, etc.                              |
| `estimatedRevenue`   | string           | "$3.0B"                                        |
| `tier`               | "Tier-1" \| "Tier-2"                                              |
| `contactRole`        | string           | "Slot Math Director", etc.                     |
| `contactName`        | string           | placeholder _<…>_                              |
| `contactEmail`       | string           | placeholder _<…>_                              |
| `typicalTitle`       | string           | "Pattern-QHP" etc.              |
| `portfolioSize`      | int              | active titles                                  |
| `annualReleases`     | int              |                                                |
| `certLabsUsed`       | string[]         | ["GLI", "BMM"]                                 |
| `jurisdictions`      | string[]         | ["NV", "UKGC"]                                 |
| `rtpStandard`        | string           | "94.0% - 96.5%"                                |
| `decisionMakerRole`  | string           | flows into MANIFEST.intendedAudience            |
| `landingPageSlug`    | string           | slugged subpath, e.g. `aristocrat-pilot`       |
| `pricingTierLabel`   | string           | flows into MANIFEST.pricingTier                 |
| `samplePricing`      | object           | `{pilotUSD, yearOneLicenseUSD, perSpinCostMills}` |

Optional:

| Field            | Type        | Notes                                |
|------------------|-------------|--------------------------------------|
| `accentColor`    | hex         | CSS accent                           |
| `competitorTo`   | string[]    | informational                        |

## How branding is applied

`applyBranding(content, manifest)` does ordered literal string replacement:

```
'Vendor B, Inc.'  → manifest.legalName
'Vendor B Inc.'   → manifest.legalName
'Vendor B'        → manifest.shortName
'light & wonder'        → manifest.shortName.lowercase
'L&amp;W'               → manifest.displayName.escaped
'L_AND_W'               → manifest.displayName.upperscored
'Vendor B'                   → manifest.displayName
'Vendor B'                   → manifest.tickerSymbol
```

Longest tokens are tried first to avoid `Vendor B` getting
half-mangled by an earlier `Vendor B` swap.

**Code-region protection**: text inside fenced code blocks ` ``` … ``` `
is left untouched, so JSON keys and code samples never get rewritten.

**HTML-aware variant**: `applyBrandingToHtml(html, manifest)` runs the
same text swap, then rewrites CSS color variables inside `<style>` and
the `<title>` tag.

## How to add a new operator

1. Copy `scripts/pitch/operators/_template.json` to
   `scripts/pitch/operators/<newId>.json`.
2. Fill every required field (the validator throws otherwise).
3. Run `node scripts/pitch/operator-branding.mjs --operator=<newId>` to
   pretty-print the loaded manifest for a sanity check.
4. Build a tarball: `npm run pitch:tarball -- --operator=<newId>`.
5. `npm test scripts/tests/operator-branding.test.mjs` — the
   "loads + validates every default operator manifest" test will pick
   up the new file automatically.

## Backward compatibility

The default operator (`lw`) is a strict identity over the W212 output:
`operatorReplacements(lwManifest)` returns `[]` and `applyBranding(…)`
is the identity function. The W212 pitch tarball produced before this
wave is byte-identical to the new `npm run pitch:tarball` output when no
`--operator=` flag is passed.
