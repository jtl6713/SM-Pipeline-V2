from pathlib import Path


source = Path("apps/studio-api/worker.js").read_text(encoding="utf-8")

required = {
    "versioned recipe constant": 'const ITEM4_VARIANT_RECIPE_VERSION = "fill-crop-v2";',
    "recipe-scoped transfer identity": (
        "ITEM4-VARIANT-${ITEM4_VARIANT_RECIPE_VERSION}-${recordId}-${assetId}-"
    ),
    "recipe-scoped filename": "__${ITEM4_VARIANT_RECIPE_VERSION}.jpg",
    "manifest schema v2": 'schema_version: "item4.variant-manifest.2"',
    "manifest recipe identity": "recipe_version: ITEM4_VARIANT_RECIPE_VERSION",
    "explicit Make recipe query": (
        '{ name: "recipe", value: ITEM4_VARIANT_RECIPE_VERSION }'
    ),
    "live SMV1 recipe drift guard": (
        "verifiedVariantRecipe !== ITEM4_VARIANT_RECIPE_VERSION"
    ),
}

missing = [name for name, needle in required.items() if needle not in source]
if missing:
    raise SystemExit("Missing Item 8 contracts: " + ", ".join(missing))

legacy_transfer = (
    "return `ITEM4-VARIANT-${recordId}-${assetId}-${item4VariantRatioKey(ratio)}`;"
)
legacy_filename = (
    "return `${item4SafeFileName(base)}__${item4VariantRatioKey(ratio)}.jpg`;"
)
if legacy_transfer in source or legacy_filename in source:
    raise SystemExit("Legacy unversioned variant identity remains active")

print("item8_recipe_contract=PASS")
