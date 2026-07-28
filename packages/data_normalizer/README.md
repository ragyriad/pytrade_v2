# Data normalizer

This package owns provider-independent data meaning:

- current symbols and historical aliases (`SNE -> SONY`, `SQ -> XYZ`);
- option contract parsing and OCC ticker formatting;
- ETF, ADR, stock, and generic security classification (option contracts are
  modeled separately and are not a security instrument type);
- reviewed exchange-scoped issuer lifecycle data, such as delisted CloudMD
  (`DOC` on TSXV), without conflating same-symbol companies;
- conservative security matching by symbol, raw provider JSON, and company description;
- transaction action/asset classification.

Duplicate identity and reconciliation rules live in `@repo/data-deduplicator`.

Provider adapters still own extraction. Questrade statement PDF coordinates remain in
`@repo/questrade-statement-import`; SnapTrade API traversal and paging remain in
`@repo/snaptrade-sync`, along with its internal activity ingestion and persistence
pipeline. Each adapter passes extracted values through this package before persistence.

`pnpm data:normalize-existing` previews normalization/link changes for existing rows.
`pnpm data:normalize-existing -- --apply` applies that preview. Applying does not merge or
archive securities; structural security merges require a separate reviewed operation.

Use `pnpm data:normalize-existing -- --preserve-actions` for the narrower identity/link/type
preview, and add `--apply` only after reviewing it. This mode leaves existing action
values unchanged.
